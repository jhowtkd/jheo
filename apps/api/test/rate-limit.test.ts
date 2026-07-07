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

describe('in-process rate limiter', () => {
  it('returns 400 (zod) not 429 for routes without rate-limit config', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/generations',
      payload: {
        prompt: 'p',
        materialIds: [],
        llmConfig: { provider: 'openai', model: 'gpt-4o-mini' },
      },
    });
    // Zod should reject body before any handler logic runs — and the
    // rate-limit hook must NOT swallow the request and return 429 even
    // when the route opts in. This guards against the bug where the hook
    // accidentally returned a value that Fastify interpreted as the
    // response body, hanging the routing.
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('templateId');
  });
});
