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

const deps = (prisma: any, provider: LLMProvider) => ({
  prisma,
  llmProviders: { openai: provider, anthropic: provider, openrouter: provider },
  fetchFn: globalThis.fetch,
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
});
