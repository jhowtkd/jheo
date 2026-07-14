import { createHash } from 'node:crypto';
import { stripLlmThinking, type LLMProvider, type LLMRequest } from '@jheo/core';
import type { PrismaClient } from '@prisma/client';
import type { SupportedLocale } from './locale.js';
import { buildTranslationSystemPrompt } from './system-prompt.js';

export type TranslateContext = 'finding' | 'generation' | 'material' | 'help';

export type TranslateDeps = {
  prisma: PrismaClient;
  llmProviders: Record<'openai' | 'anthropic' | 'openrouter', LLMProvider>;
  fetchFn: typeof fetch;
  /** Optional logger for internal warnings (e.g. splitTranslations truncation). */
  logFn?: (msg: string) => void;
};

export type TranslateInput = {
  texts: string[];
  targetLocale: SupportedLocale;
  context: TranslateContext;
};

export type TranslateOutput = {
  translations: Array<{ original: string; translated: string; cached: boolean }>;
};

function makeCacheKey(text: string, locale: SupportedLocale, ctx: TranslateContext): string {
  return createHash('sha256').update(`${text}|${locale}|${ctx}`).digest('hex');
}

/**
 * Split a single LLM response into one translation per input line.
 * Empty lines are preserved as empty (the caller filters them).
 *
 * If the LLM returns fewer lines than expected, the trailing slots fall back
 * to the original English silently (see the caller's `translated[i] ?? t.text`).
 * A warning is logged in that case so the silent degradation is visible in
 * operator logs.
 */
function splitTranslations(blob: string, expected: number, log?: (msg: string) => void): string[] {
  const lines = blob
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === expected) return lines;
  // Defensive: the LLM sometimes adds a trailing explanation. Trim until we
  // have at least `expected` non-empty lines, or fall back to the whole blob.
  if (lines.length < expected) {
    (log ?? console.warn)(
      `[i18n] splitTranslations: expected ${expected} line(s), got ${lines.length}; ` +
        `missing slots will fall back to the original text.`,
    );
  }
  return lines.slice(0, expected);
}

export async function translateBatch(
  deps: TranslateDeps,
  input: TranslateInput,
): Promise<TranslateOutput> {
  const { texts, targetLocale, context } = input;

  // Defensive short-circuit (spec §4.4 step 2): en target = no LLM.
  if (targetLocale === 'en') {
    return {
      translations: texts.map((t) => ({ original: t, translated: t, cached: true })),
    };
  }

  const keys = texts.map((t) => makeCacheKey(t, targetLocale, context));
  const cached = await deps.prisma.translationCache.findMany({
    where: { cacheKey: { in: keys } },
  });
  const cachedByKey = new Map(cached.map((c) => [c.cacheKey, c]));

  const result: TranslateOutput['translations'] = [];
  // Track slot indices so duplicate input strings each get the right
  // translation in their own slot (findIndex on `original` would race).
  const toTranslate: Array<{ text: string; cacheKey: string; slotIdx: number }> = [];

  texts.forEach((text, i) => {
    const key = keys[i]!;
    const hit = cachedByKey.get(key);
    if (hit) {
      result.push({ original: text, translated: hit.translated, cached: true });
    } else {
      result.push({ original: text, translated: '', cached: false });
      toTranslate.push({ text, cacheKey: key, slotIdx: i });
    }
  });

  if (toTranslate.length > 0) {
    // Prefer OpenAI (cheapest, fastest) for translations; fall back to others
    // if a key is missing. Same provider is reused for the whole batch to
    // keep the prompt consistent.
    const provider =
      deps.llmProviders.openai ?? deps.llmProviders.anthropic ?? deps.llmProviders.openrouter;
    if (!provider) throw new Error('no_llm_provider');

    const system = buildTranslationSystemPrompt(targetLocale);
    const userPrompt = toTranslate.map((t) => t.text).join('\n');
    // Same override pattern as F7 suggestions: MiniMax (and other
    // OpenAI-compatible hosts) reject OpenAI model ids like `gpt-4o-mini`.
    // Prefer a translate-specific override, then fall back to the suggestion
    // model so a single `JHEO_SUGGESTION_MODEL=MiniMax-M3` covers both.
    const model =
      process.env.JHEO_TRANSLATE_MODEL ?? process.env.JHEO_SUGGESTION_MODEL ?? 'gpt-4o-mini';
    // #region agent log
    fetch('http://host.docker.internal:7266/ingest/6183d87d-7163-44e1-b4c0-8eeb01a85d67', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'fb8da3' },
      body: JSON.stringify({
        sessionId: 'fb8da3',
        runId: 'post-fix',
        hypothesisId: 'A',
        location: 'translate.ts:model',
        message: 'translateBatch model selected',
        data: {
          model,
          baseUrlSet: Boolean(process.env.OPENAI_BASE_URL),
          missCount: toTranslate.length,
          targetLocale,
          context,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    const req: LLMRequest = {
      prompt: userPrompt,
      system,
      config: { model, temperature: 0.2 },
      signal: AbortSignal.timeout(30_000),
    };
    let res;
    try {
      res = await provider.complete(req, deps.fetchFn);
    } catch (e) {
      // #region agent log
      fetch('http://host.docker.internal:7266/ingest/6183d87d-7163-44e1-b4c0-8eeb01a85d67', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'fb8da3' },
        body: JSON.stringify({
          sessionId: 'fb8da3',
          runId: 'post-fix',
          hypothesisId: 'A',
          location: 'translate.ts:complete-error',
          message: 'translateBatch LLM complete failed',
          data: { model, err: e instanceof Error ? e.message.slice(0, 200) : String(e) },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      throw e;
    }
    const cleaned = stripLlmThinking(res.text);
    // #region agent log
    fetch('http://host.docker.internal:7266/ingest/6183d87d-7163-44e1-b4c0-8eeb01a85d67', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'fb8da3' },
      body: JSON.stringify({
        sessionId: 'fb8da3',
        runId: 'post-fix',
        hypothesisId: 'B',
        location: 'translate.ts:complete-ok',
        message: 'translateBatch LLM complete ok',
        data: {
          model,
          provider: res.provider,
          resModel: res.model,
          rawLen: res.text.length,
          cleanedLen: cleaned.length,
          rawHadThink: /<think>/i.test(res.text),
          cleanedPreview: cleaned.slice(0, 120),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    const translated = splitTranslations(cleaned, toTranslate.length, deps.logFn);

    await Promise.all(
      toTranslate.map(async (t, i) => {
        const translatedText = translated[i] ?? t.text;
        await deps.prisma.translationCache.create({
          data: {
            cacheKey: t.cacheKey,
            text: t.text,
            targetLocale,
            context,
            translated: translatedText,
            provider: res.provider,
            model: res.model,
          },
        });
        // Backfill by the original input slot so duplicate input strings
        // each land in their own result slot.
        result[t.slotIdx] = { original: t.text, translated: translatedText, cached: false };
      }),
    );
  }

  return { translations: result };
}
