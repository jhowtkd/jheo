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

  it('each (ip, method, url) gets its own bucket — endpoints do not share quota', async () => {
    // Regression guard: an earlier draft of server.ts keyed the limiter
    // cache by `m{limit.max}:w{limit.windowMs}` only, so two endpoints
    // with the same rate-limit config (e.g. 10/min) shared a single
    // 10-token bucket. The smoke proof: exhaust the executive-report
    // bucket to 429 by hammering it past its budget, then confirm a
    // request to a DIFFERENT route (translate) is unaffected — its own
    // bucket is independent.
    //
    // We use the translate route because the only "no-DB" rate-limited
    // route is one we can also drive with app.inject; the body fails
    // zod validation (no LLM provider), but the rate-limit hook runs
    // BEFORE the handler so we still get a deterministic response code.
    const seen429: number[] = [];
    for (let i = 0; i < 70; i++) {
      const r = await app.inject({
        method: 'GET',
        url: '/api/audits/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/executive-report',
      });
      seen429.push(r.statusCode);
    }
    // The exec-report budget is 60/min; 70 calls must produce at least
    // one 429.
    expect(seen429.filter((s) => s === 429).length).toBeGreaterThan(0);

    // Translate route has its own bucket — it should still answer. The
    // body fails zod (no body, no LLM provider) but the rate-limit
    // hook runs first, so we just need to confirm it isn't 429.
    const translateRes = await app.inject({
      method: 'POST',
      url: '/api/translate',
      payload: { texts: ['hi'], targetLocale: 'en', context: 'finding' },
    });
    expect(translateRes.statusCode).not.toBe(429);
  });
});
