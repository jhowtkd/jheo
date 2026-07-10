import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { translateBatch } from '../src/i18n/translate.js';
import type { LLMProvider, LLMRequest, LLMResponse } from '@jheo/core';

const cacheKey = (text: string, locale: string, ctx: string) =>
  createHash('sha256').update(`${text}|${locale}|${ctx}`).digest('hex');

function fakePrisma() {
  const rows = new Map<string, { cacheKey: string; text: string; targetLocale: string; context: string; translated: string; provider: string; model: string }>();
  return {
    translationCache: {
      findMany: async ({ where }: { where: { cacheKey: { in: string[] } } }) =>
        where.cacheKey.in.map((k) => rows.get(k)).filter(Boolean) as any[],
      create: async ({ data }: { data: any }) => {
        rows.set(data.cacheKey, data);
        return data;
      },
    },
  } as any;
}

function fakeProvider(text: string): LLMProvider {
  return {
    complete: async (_req: LLMRequest, _fetch: typeof fetch): Promise<LLMResponse> => ({
      text,
      usage: { promptTokens: 0, completionTokens: 0 },
      provider: 'openai',
      model: 'gpt-4o-mini',
    }),
  };
}

function spyProvider(text: string): LLMProvider {
  const p = fakeProvider(text);
  const spy = vi.fn(p.complete);
  return { ...p, complete: spy as any };
}

const deps = (prisma: any, provider: LLMProvider, logFn?: (msg: string) => void) => ({
  prisma,
  llmProviders: { openai: provider, anthropic: provider, openrouter: provider },
  fetchFn: globalThis.fetch,
  logFn,
});

describe('translateBatch', () => {
  let prisma: any;
  beforeEach(() => {
    prisma = fakePrisma();
  });

  it('short-circuits when targetLocale is en', async () => {
    const out = await translateBatch(deps(prisma, spyProvider('unused')), {
      texts: ['Meta description is missing.'],
      targetLocale: 'en',
      context: 'finding',
    });
    expect(out.translations).toEqual([
      { original: 'Meta description is missing.', translated: 'Meta description is missing.', cached: true },
    ]);
  });

  it('returns cached translations without calling the LLM', async () => {
    const original = 'Image alt is empty.';
    const expected = 'A imagem não tem texto alternativo.';
    const key = cacheKey(original, 'pt-BR', 'finding');
    await prisma.translationCache.create({
      data: { cacheKey: key, text: original, targetLocale: 'pt-BR', context: 'finding', translated: expected, provider: 'openai', model: 'gpt-4o-mini' },
    });
    const provider = spyProvider('should not be called');
    const out = await translateBatch(deps(prisma, provider), {
      texts: [original],
      targetLocale: 'pt-BR',
      context: 'finding',
    });
    expect(out.translations[0].translated).toBe(expected);
    expect(out.translations[0].cached).toBe(true);
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('calls the LLM once for misses and persists results', async () => {
    const provider = spyProvider('Falta a descrição da página.');
    const out = await translateBatch(deps(prisma, provider), {
      texts: ['Meta description is missing.'],
      targetLocale: 'pt-BR',
      context: 'finding',
    });
    expect(out.translations[0]).toEqual({
      original: 'Meta description is missing.',
      translated: 'Falta a descrição da página.',
      cached: false,
    });
    expect(provider.complete).toHaveBeenCalledTimes(1);
    // Verify the result was persisted
    const key = cacheKey('Meta description is missing.', 'pt-BR', 'finding');
    const stored = await prisma.translationCache.findMany({ where: { cacheKey: { in: [key] } } });
    expect(stored).toHaveLength(1);
  });

  it('handles mixed cache and miss in one batch', async () => {
    const cachedOriginal = 'Cached line';
    const key = cacheKey(cachedOriginal, 'pt-BR', 'finding');
    await prisma.translationCache.create({
      data: { cacheKey: key, text: cachedOriginal, targetLocale: 'pt-BR', context: 'finding', translated: 'Linha em cache', provider: 'openai', model: 'gpt-4o-mini' },
    });
    const provider = spyProvider('Linha traduzida agora');
    const out = await translateBatch(deps(prisma, provider), {
      texts: [cachedOriginal, 'Fresh line'],
      targetLocale: 'pt-BR',
      context: 'finding',
    });
    expect(out.translations[0].cached).toBe(true);
    expect(out.translations[1].cached).toBe(false);
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });

  it('preserves input slot order when input strings repeat', async () => {
    // Three input slots, two of which are duplicates. The LLM is called once
    // with the three miss-texts in order, and the result must be projected
    // back to the *original* input positions (not just unique positions).
    // Before the slotIdx fix, result[2] was being addressed via
    // findIndex(r.original === t.text), which matched slot 0 instead.
    const provider = spyProvider('A1\nB1\nA2');
    const out = await translateBatch(deps(prisma, provider), {
      texts: ['First unique', 'Second unique', 'First unique'],
      targetLocale: 'pt-BR',
      context: 'finding',
    });
    expect(out.translations).toHaveLength(3);
    expect(provider.complete).toHaveBeenCalledTimes(1);
    // Slot 0 = 'First unique' → 'A1'
    expect(out.translations[0]).toEqual({
      original: 'First unique',
      translated: 'A1',
      cached: false,
    });
    // Slot 1 = 'Second unique' → 'B1'
    expect(out.translations[1]).toEqual({
      original: 'Second unique',
      translated: 'B1',
      cached: false,
    });
    // Slot 2 = 'First unique' (duplicate) → 'A2' (the LLM's third line, not
    // slot 0's translation). This is the key invariant.
    expect(out.translations[2]).toEqual({
      original: 'First unique',
      translated: 'A2',
      cached: false,
    });
  });

  it('falls back to original texts when the LLM returns fewer lines than expected, and logs a warning', async () => {
    // Regression for the silent fallback in splitTranslations. The LLM
    // returned only one translation line for a 3-text batch; the function
    // must still produce 3 result rows, with slots 2 and 3 falling back to
    // their original English text, and a warning must be surfaced via the
    // optional logFn.
    const log = vi.fn();
    const provider = spyProvider('Apenas uma linha traduzida.');
    const out = await translateBatch(deps(prisma, provider, log), {
      texts: ['First text.', 'Second text.', 'Third text.'],
      targetLocale: 'pt-BR',
      context: 'finding',
    });
    expect(out.translations).toHaveLength(3);
    expect(out.translations[0]).toEqual({
      original: 'First text.',
      translated: 'Apenas uma linha traduzida.',
      cached: false,
    });
    // Slots 2 and 3 silently fall back to the original English.
    expect(out.translations[1]).toEqual({
      original: 'Second text.',
      translated: 'Second text.',
      cached: false,
    });
    expect(out.translations[2]).toEqual({
      original: 'Third text.',
      translated: 'Third text.',
      cached: false,
    });
    // The operator must see this in logs.
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('splitTranslations'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('expected 3'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('got 1'));
  });

  it('strips MiniMax-style <think> prefixes before splitting lines', async () => {
    const provider = spyProvider(
      '<think>\nreasoning about the translation\n</think>\n\nA meta descrição está ausente.',
    );
    const out = await translateBatch(deps(prisma, provider), {
      texts: ['Meta description is missing.'],
      targetLocale: 'pt-BR',
      context: 'finding',
    });
    expect(out.translations[0]?.translated).toBe('A meta descrição está ausente.');
  });
});
