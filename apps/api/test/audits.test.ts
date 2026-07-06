import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { prisma } from '../src/db.js';

let app: Awaited<ReturnType<typeof buildServer>> | undefined;
// These tests build the Fastify app, which registers routes that touch
// prisma at request time. When no DB is reachable (e.g. local run without
// docker compose), we skip them cleanly rather than reporting failures.
let canRunDb = false;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    canRunDb = true;
  } catch {
    canRunDb = false;
    return;
  }
  app = await buildServer();
  await app.ready();
});
afterAll(async () => {
  if (app) await app.close();
  // Disconnect prisma so vitest can exit cleanly even when the test was skipped.
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
});

describe('routes/audits', () => {
  it.runIf(canRunDb)('rejects invalid bodies', async () => {
    const res = await app!.inject({ method: 'POST', url: '/api/audits', payload: { projectId: '' } });
    expect(res.statusCode).toBe(400);
  });
  it.runIf(canRunDb)('returns 404 for unknown audit id', async () => {
    const res = await app!.inject({ method: 'GET', url: '/api/audits/does-not-exist' });
    expect(res.statusCode).toBe(404);
  });
});