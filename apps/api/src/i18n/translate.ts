import { createHash } from 'node:crypto';
import type { LLMProvider, LLMRequest } from '@jheo/core';
import type { PrismaClient } from '@prisma/client';
import type { SupportedLocale } from './locale.js';
import { buildTranslationSystemPrompt } from './system-prompt.js';

export type TranslateContext = 'finding' | 'generation' | 'material' | 'help';

export type TranslateDeps = {
  prisma: PrismaClient;
  llmProviders: Record<'openai' | 'anthropic' | 'openrouter', LLMProvider>;
  fetchFn: typeof fetch;
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
 */
function splitTranslations(blob: string, expected: number): string[] {
  const lines = blob.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === expected) return lines;
  // Defensive: the LLM sometimes adds a trailing explanation. Trim until we
  // have at least `expected` non-empty lines, or fall back to the whole blob.
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
      deps.llmProviders.openai ??
      deps.llmProviders.anthropic ??
      deps.llmProviders.openrouter;
    if (!provider) throw new Error('no_llm_provider');

    const system = buildTranslationSystemPrompt(targetLocale);
    const userPrompt = toTranslate.map((t) => t.text).join('\n');
    const req: LLMRequest = {
      prompt: userPrompt,
      system,
      config: { model: 'gpt-4o-mini', temperature: 0.2 },
    };
    const res = await provider.complete(req, deps.fetchFn);
    const translated = splitTranslations(res.text, toTranslate.length);

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
