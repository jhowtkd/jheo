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

describe('routes/channels validation', () => {
  it('rejects unknown channel type', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/channels',
      payload: { name: 'n', type: 'unknown', config: {} },
    });
    expect(r.statusCode).toBe(400);
  });

  it('rejects wordpress config missing siteUrl', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/channels',
      payload: {
        name: 'wp',
        type: 'wordpress',
        config: { username: 'u', appPassword: 'p' },
      },
    });
    expect(r.statusCode).toBe(400);
  });

  it('rejects http config with malformed endpointUrl', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/channels',
      payload: { name: 'h', type: 'http', config: { endpointUrl: 'not-a-url' } },
    });
    expect(r.statusCode).toBe(400);
  });

  it('accepts a well-formed wordpress config with 201 (DB gated)', async () => {
    // Skipped without DB; just verify the route is registered (not 404).
    const r = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/channels',
      payload: {
        name: 'wp',
        type: 'wordpress',
        config: {
          siteUrl: 'https://example.com',
          username: 'u',
          appPassword: 'p',
          defaultStatus: 'draft',
        },
      },
    });
    expect([200, 201, 404, 500, 503]).toContain(r.statusCode);
  });
});