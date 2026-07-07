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

describe('routes/projects', () => {
  it.runIf(canRunDb)('rejects invalid bodies', async () => {
    const res = await app!.inject({ method: 'POST', url: '/api/projects', payload: { name: '', rootUrl: 'not-a-url' } });
    expect(res.statusCode).toBe(400);
  });
  it.runIf(canRunDb)('creates a project', async () => {
    const res = await app!.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Example', rootUrl: 'https://example.com' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBeTypeOf('string');
  });
  it.runIf(canRunDb)('accepts a bare domain and normalizes to https://<domain>/', async () => {
    const res = await app!.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'example', domain: 'example.com' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rootUrl).toBe('https://example.com/');
    expect(body.name).toBe('example');
  });

  it.runIf(canRunDb)('GET /:id/pages returns paginated list', async () => {
    const created = await app!.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'pages-list', domain: 'example.com' },
    });
    const { id } = created.json();

    const res = await app!.inject({
      method: 'GET',
      url: `/api/projects/${id}/pages?limit=10&offset=0`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ total: expect.any(Number), limit: 10, offset: 0 });
    expect(Array.isArray(body.items)).toBe(true);
  });

  it.runIf(canRunDb)('GET /:id/pages?filter=not_audited returns only un-audited pages', async () => {
    const created = await app!.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'pages-filter', domain: 'example.com' },
    });
    const { id } = created.json();

    const res = await app!.inject({
      method: 'GET',
      url: `/api/projects/${id}/pages?filter=not_audited`,
    });
    expect(res.statusCode).toBe(200);
    for (const item of res.json().items) {
      expect(item.lastAuditedAt).toBeNull();
    }
  });

  it.runIf(canRunDb)('GET /:id/pages returns 404 for unknown project', async () => {
    const res = await app!.inject({ method: 'GET', url: '/api/projects/does-not-exist/pages' });
    expect(res.statusCode).toBe(404);
  });
});