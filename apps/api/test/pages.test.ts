import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { prisma } from '../src/db.js';

let app: Awaited<ReturnType<typeof buildServer>> | undefined;
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
  try { await prisma.$disconnect(); } catch { /* ignore */ }
});

describe('routes/pages', () => {
  it.runIf(canRunDb)('POST /:id/audit returns 404 for unknown page', async () => {
    const res = await app!.inject({ method: 'POST', url: '/api/pages/does-not-exist/audit' });
    expect(res.statusCode).toBe(404);
  });

  it.runIf(canRunDb)('POST /:id/audit returns 409 if a re-audit is in progress', async () => {
    // Create a project + page manually
    const project = await prisma.project.create({
      data: { name: 'pages-route-test', rootUrl: 'https://example.com/' },
    });
    const page = await prisma.projectPage.create({
      data: { projectId: project.id, url: 'https://example.com/test', discoveredVia: 'root' },
    });
    await prisma.pageAudit.create({
      data: { projectPageId: page.id, status: 'running' },
    });
    const res = await app!.inject({ method: 'POST', url: `/api/pages/${page.id}/audit` });
    expect(res.statusCode).toBe(409);
  });

  it.runIf(canRunDb)('POST /:id/audit queues a standalone re-audit', async () => {
    const project = await prisma.project.create({
      data: { name: 'pages-queue-test', rootUrl: 'https://example.com/' },
    });
    const page = await prisma.projectPage.create({
      data: { projectId: project.id, url: 'https://example.com/queue', discoveredVia: 'root' },
    });
    const res = await app!.inject({ method: 'POST', url: `/api/pages/${page.id}/audit` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pageAuditId).toBeTruthy();
  });

  it.runIf(canRunDb)('GET /:id returns 404 for unknown page audit', async () => {
    const res = await app!.inject({ method: 'GET', url: '/api/page-audits/does-not-exist' });
    expect(res.statusCode).toBe(404);
  });
});
