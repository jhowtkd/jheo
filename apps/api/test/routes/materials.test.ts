import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/server.js';
import { prisma } from '../../src/db.js';

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

describe('routes/materials validation', () => {
  it.runIf(canRunDb)('rejects missing type', async () => {
    const r = await app!.inject({
      method: 'POST',
      url: '/api/projects/p1/materials',
      payload: { title: 't', source: 'http://example.com' },
    });
    expect(r.statusCode).toBe(400);
  });
  it.runIf(canRunDb)('rejects unknown type', async () => {
    const r = await app!.inject({
      method: 'POST',
      url: '/api/projects/p1/materials',
      payload: { type: 'pdf', title: 't', source: 'x' },
    });
    expect(r.statusCode).toBe(400);
  });
});