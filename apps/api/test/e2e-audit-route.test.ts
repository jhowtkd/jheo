import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';

let app: Awaited<ReturnType<typeof buildServer>>;

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe('routes/audits validation', () => {
  it('rejects missing projectId', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/audits', payload: { config: {} } });
    expect(res.statusCode).toBe(400);
  });
  it('returns 404 for unknown audit', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/audits/nonexistent' });
    expect(res.statusCode).toBe(404);
  });
});
