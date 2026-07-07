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

  it.runIf(canRunDb)('GET /:id/progress returns 404 for unknown audit', async () => {
    const res = await app!.inject({ method: 'GET', url: '/api/audits/does-not-exist/progress' });
    expect(res.statusCode).toBe(404);
  });

  it.runIf(canRunDb)('DELETE /:id returns 409 for already-completed audit', async () => {
    // Create a project, an audit, mark it completed
    const proj = await app!.inject({
      method: 'POST', url: '/api/projects',
      payload: { name: 'cancel-test', domain: 'example.com' },
    });
    const { id: pid } = proj.json();
    const auditRes = await app!.inject({
      method: 'POST', url: '/api/audits',
      payload: { projectId: pid },
    });
    const { id: aid } = auditRes.json();
    // Mark it completed via prisma (test-only shortcut)
    const { prisma } = await import('../src/db.js');
    await prisma.audit.update({ where: { id: aid }, data: { status: 'completed' } });

    const res = await app!.inject({ method: 'DELETE', url: `/api/audits/${aid}` });
    expect(res.statusCode).toBe(409);
  });

  it.runIf(canRunDb)('DELETE /:id sets status=cancelled for a running audit', async () => {
    const proj = await app!.inject({
      method: 'POST', url: '/api/projects',
      payload: { name: 'cancel-running', domain: 'example.com' },
    });
    const { id: pid } = proj.json();
    const auditRes = await app!.inject({
      method: 'POST', url: '/api/audits',
      payload: { projectId: pid },
    });
    const { id: aid } = auditRes.json();

    const res = await app!.inject({ method: 'DELETE', url: `/api/audits/${aid}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: aid, status: 'cancelled' });
  });
});