import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { translateRoutes } from '../src/routes/translate.js';
import { registerLocaleHook } from '../src/i18n/hook.js';

let app: FastifyInstance;

const fakePrisma = () => ({
  translationCache: {
    findMany: async () => [],
    create: async ({ data }: any) => data,
  },
});
const provider = {
  complete: async () => ({
    text: 'Linha um\nLinha dois',
    usage: { promptTokens: 0, completionTokens: 0 },
    provider: 'openai',
    model: 'gpt-4o-mini',
  }),
};

beforeAll(async () => {
  app = Fastify();
  registerLocaleHook(app);
  await app.register(translateRoutes, {
    prisma: fakePrisma() as any,
    llmProviders: { openai: provider as any, anthropic: provider as any, openrouter: provider as any },
    fetchFn: globalThis.fetch,
  });
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe('POST /api/translate', () => {
  it('returns 400 on empty texts', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/translate',
      payload: { texts: [], targetLocale: 'pt-BR', context: 'finding' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 on too many texts', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/translate',
      payload: { texts: Array(51).fill('x'), targetLocale: 'pt-BR', context: 'finding' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 on unknown context', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/translate',
      payload: { texts: ['x'], targetLocale: 'pt-BR', context: 'bogus' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('translates via LLM and returns cached:false on miss', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/translate',
      payload: { texts: ['Line one', 'Line two'], targetLocale: 'pt-BR', context: 'finding' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.translations).toHaveLength(2);
    expect(body.translations[0].translated).toBe('Linha um');
    expect(body.translations[0].cached).toBe(false);
  });

  it('returns 503 when no LLM provider is configured', async () => {
    const localApp = Fastify();
    registerLocaleHook(localApp);
    await localApp.register(translateRoutes, {
      prisma: fakePrisma() as any,
      llmProviders: {} as any,
      fetchFn: globalThis.fetch,
    });
    await localApp.ready();
    const res = await localApp.inject({
      method: 'POST',
      url: '/api/translate',
      payload: { texts: ['x'], targetLocale: 'pt-BR', context: 'finding' },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('no_llm_provider');
    await localApp.close();
  });
});
