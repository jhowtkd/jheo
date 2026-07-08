import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerLocaleHook } from '../src/i18n/hook.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  registerLocaleHook(app);
  app.get('/echo', async (req) => ({ locale: req.locale }));
  app.get('/cl', async (_req, reply) => {
    reply.header('content-language', 'ja');
    return { ok: true };
  });
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe('registerLocaleHook', () => {
  it('defaults to en when no Accept-Language', async () => {
    const res = await app.inject({ method: 'GET', url: '/echo' });
    expect(res.json().locale).toBe('en');
    expect(res.headers['content-language']).toBe('en');
  });

  it('negotiates pt-BR from Accept-Language', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { 'accept-language': 'pt-BR' },
    });
    expect(res.json().locale).toBe('pt-BR');
    expect(res.headers['content-language']).toBe('pt-BR');
  });

  it('does not overwrite an existing Content-Language', async () => {
    const res = await app.inject({ method: 'GET', url: '/cl' });
    expect(res.headers['content-language']).toBe('ja');
  });
});
