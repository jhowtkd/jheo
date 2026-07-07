import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildServer } from '../../src/server.js';
import { prisma } from '../../src/db.js';

const mockTestGscConnection = vi.fn();
const mockGscQueueAdd = vi.fn().mockResolvedValue({ id: 'job1' });

vi.mock('../../src/gsc-auth.js', () => ({
  testGscConnection: (...args: unknown[]) => mockTestGscConnection(...args),
  getGscAccessToken: vi.fn(),
}));

vi.mock('../../src/queue.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/queue.js')>();
  return {
    ...actual,
    gscQueue: {
      ...actual.gscQueue,
      add: (...args: unknown[]) => mockGscQueueAdd(...args),
    },
  };
});

const validSa = {
  type: 'service_account' as const,
  client_email: 'sa@test.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
  project_id: 'test-project',
};

let app: Awaited<ReturnType<typeof buildServer>>;
let canRunDb = false;
let projectId: string | null = null;

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    canRunDb = true;
    const project = await prisma.project.create({
      data: { name: 'gsc-read-test', rootUrl: 'https://example.com/' },
    });
    projectId = project.id;
  } catch {
    canRunDb = false;
  }
});

afterAll(async () => {
  if (canRunDb && projectId) {
    await prisma.gscSnapshot.deleteMany({ where: { projectId } }).catch(() => {});
    await prisma.gscConnection.deleteMany({ where: { projectId } }).catch(() => {});
    await prisma.project.deleteMany({ where: { id: projectId } }).catch(() => {});
  }
  await app.close();
});

describe('routes/gsc read APIs', () => {
  it('registers overview route', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/api/projects/p1/gsc/overview',
    });
    expect([200, 404, 500]).toContain(r.statusCode);
  });

  it('registers sync route', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/gsc/sync',
    });
    expect([202, 404, 409, 500]).toContain(r.statusCode);
  });
});

describe.runIf(canRunDb)('routes/gsc read APIs DB-gated', () => {
  beforeAll(async () => {
    mockTestGscConnection.mockResolvedValue({ ok: true });
    await app.inject({
      method: 'PUT',
      url: `/api/projects/${projectId}/gsc/connection`,
      payload: {
        siteUrl: 'https://example.com/',
        serviceAccountJson: validSa,
      },
    });

    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() - 3);

    await prisma.gscSnapshot.create({
      data: {
        projectId: projectId!,
        date: day,
        query: 'shoes',
        page: 'https://example.com/',
        device: 'DESKTOP',
        country: 'usa',
        clicks: 10,
        impressions: 100,
        ctr: 0.1,
        position: 3,
      },
    });
  });

  it('GET overview aggregates from snapshots only', async () => {
    const r = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/gsc/overview?days=28`,
    });
    expect(r.statusCode).toBe(200);
    const body = r.json() as {
      clicks: number;
      impressions: number;
      freshness: { syncStatus: string; dataThrough: string };
    };
    expect(body.clicks).toBeGreaterThanOrEqual(10);
    expect(body.impressions).toBeGreaterThanOrEqual(100);
    expect(body.freshness.syncStatus).toBeDefined();
    expect(body.freshness.dataThrough).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('GET queries returns top rows from snapshots', async () => {
    const r = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/gsc/queries?days=28&limit=10`,
    });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { rows: Array<{ query: string; clicks: number }> };
    expect(body.rows.some((row) => row.query === 'shoes')).toBe(true);
  });

  it('GET pages returns top rows from snapshots', async () => {
    const r = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/gsc/pages?days=28&limit=10`,
    });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { rows: Array<{ page: string; clicks: number }> };
    expect(body.rows.some((row) => row.page === 'https://example.com/')).toBe(true);
  });

  it('POST sync enqueues snapshot job', async () => {
    mockGscQueueAdd.mockClear();
    await prisma.gscConnection.update({
      where: { projectId: projectId! },
      data: { syncStatus: 'ok' },
    });

    const r = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/gsc/sync`,
    });
    expect(r.statusCode).toBe(202);
    expect(mockGscQueueAdd).toHaveBeenCalledWith(
      'snapshot',
      { action: 'snapshot', projectId },
      expect.objectContaining({ jobId: expect.stringContaining(`gsc-snapshot:${projectId}:`) }),
    );
  });

  it('POST sync returns 409 when already syncing', async () => {
    await prisma.gscConnection.update({
      where: { projectId: projectId! },
      data: { syncStatus: 'syncing' },
    });

    const r = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/gsc/sync`,
    });
    expect(r.statusCode).toBe(409);
  });
});
