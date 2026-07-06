import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/server.js';
import { prisma } from '../../src/db.js';

let app: Awaited<ReturnType<typeof buildServer>>;
// `GET /api/generations/:id` touches prisma at request time. When no DB is
// reachable (e.g. local run without docker compose), we skip that test
// cleanly rather than reporting a Prisma connection error as a 500 failure.
let canRunDb = false;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    canRunDb = true;
  } catch {
    canRunDb = false;
  }
  app = await buildServer();
  await app.ready();
});
afterAll(async () => {
  if (app) await app.close();
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
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
  it.runIf(canRunDb)('returns 404 for unknown generation', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/generations/nope' });
    expect(r.statusCode).toBe(404);
  });
});
