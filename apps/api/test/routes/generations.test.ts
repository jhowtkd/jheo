import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/server.js';

let app: Awaited<ReturnType<typeof buildServer>>;

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe('routes/generations validation', () => {
  it('rejects missing templateId', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/generations',
      payload: { prompt: 'p', materialIds: [], llmConfig: { provider: 'openai', model: 'gpt-4o-mini' } },
    });
    expect(r.statusCode).toBe(400);
  });

  it('rejects unknown review action', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/generations/g1/review',
      payload: { action: 'flip_out' },
    });
    expect(r.statusCode).toBe(400);
  });
});

describe('routes/generations', () => {
  it('returns 404 for unknown generation', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/generations/nope' });
    expect(r.statusCode).toBe(404);
  });
});
