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

describe('routes/projects', () => {
  it('rejects invalid bodies', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: '', rootUrl: 'not-a-url' } });
    expect(res.statusCode).toBe(400);
  });
  it('creates a project', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Example', rootUrl: 'https://example.com' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBeTypeOf('string');
  });
});
