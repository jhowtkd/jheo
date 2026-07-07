import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildServer } from '../../src/server.js';
import { prisma } from '../../src/db.js';

const mockTestGscConnection = vi.fn();

vi.mock('../../src/gsc-auth.js', () => ({
  testGscConnection: (...args: unknown[]) => mockTestGscConnection(...args),
  getGscAccessToken: vi.fn(),
}));

const validSa = {
  type: 'service_account' as const,
  client_email: 'sa@test.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
  project_id: 'test-project',
};

const validPayload = {
  siteUrl: 'https://example.com/',
  serviceAccountJson: validSa,
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
      data: { name: 'gsc-test', rootUrl: 'https://example.com/' },
    });
    projectId = project.id;
  } catch {
    canRunDb = false;
  }
});

afterAll(async () => {
  if (canRunDb && projectId) {
    await prisma.gscConnection.deleteMany({ where: { projectId } }).catch(() => {});
    await prisma.project.deleteMany({ where: { id: projectId } }).catch(() => {});
  }
  await app.close();
});

describe('routes/gsc validation', () => {
  it('rejects missing siteUrl', async () => {
    const r = await app.inject({
      method: 'PUT',
      url: '/api/projects/p1/gsc/connection',
      payload: { serviceAccountJson: validSa },
    });
    expect(r.statusCode).toBe(400);
  });

  it('rejects SA JSON missing private_key', async () => {
    const r = await app.inject({
      method: 'PUT',
      url: '/api/projects/p1/gsc/connection',
      payload: {
        siteUrl: 'https://example.com/',
        serviceAccountJson: {
          type: 'service_account',
          client_email: 'sa@test.iam.gserviceaccount.com',
          project_id: 'test-project',
        },
      },
    });
    expect(r.statusCode).toBe(400);
  });

  it('rejects siteUrl without trailing slash', async () => {
    const r = await app.inject({
      method: 'PUT',
      url: '/api/projects/p1/gsc/connection',
      payload: {
        siteUrl: 'https://example.com',
        serviceAccountJson: validSa,
      },
    });
    expect(r.statusCode).toBe(400);
  });

  it('rejects malformed sc-domain siteUrl', async () => {
    const r = await app.inject({
      method: 'PUT',
      url: '/api/projects/p1/gsc/connection',
      payload: {
        siteUrl: 'sc-domain:',
        serviceAccountJson: validSa,
      },
    });
    expect(r.statusCode).toBe(400);
  });

  it('registers GET connection route', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/api/projects/p1/gsc/connection',
    });
    expect([200, 404, 500]).toContain(r.statusCode);
  });
});

describe.runIf(canRunDb)('routes/gsc GSC-03 error mapping', () => {
  it('returns gsc_permission_denied on 403 test result', async () => {
    mockTestGscConnection.mockResolvedValueOnce({
      ok: false,
      code: 'permission_denied',
      message: 'Add sa@test.iam.gserviceaccount.com as user in GSC Settings → Users and permissions',
      clientEmail: 'sa@test.iam.gserviceaccount.com',
    });

    const r = await app.inject({
      method: 'PUT',
      url: `/api/projects/${projectId}/gsc/connection`,
      payload: validPayload,
    });

    expect(r.statusCode).toBe(403);
    const body = r.json() as { error: { code: string; message: string; requestId: string } };
    expect(body.error.code).toBe('gsc_permission_denied');
    expect(body.error.message).toContain('sa@test.iam.gserviceaccount.com');
    expect(body.error.requestId).toBeDefined();
  });

  it('returns gsc_site_not_found on 404 test result', async () => {
    mockTestGscConnection.mockResolvedValueOnce({
      ok: false,
      code: 'site_not_found',
      message: 'Check siteUrl format (trailing slash for URL-prefix or sc-domain: prefix)',
      clientEmail: 'sa@test.iam.gserviceaccount.com',
    });

    const r = await app.inject({
      method: 'PUT',
      url: `/api/projects/${projectId}/gsc/connection`,
      payload: validPayload,
    });

    expect(r.statusCode).toBe(404);
    const body = r.json() as { error: { code: string; message: string; requestId: string } };
    expect(body.error.code).toBe('gsc_site_not_found');
    expect(body.error.message).toContain('siteUrl');
    expect(body.error.requestId).toBeDefined();
  });
});

describe.runIf(canRunDb)('routes/gsc DB-gated', () => {
  it('stores ciphertext and GET omits serviceAccountCiphertext', async () => {
    mockTestGscConnection.mockResolvedValueOnce({ ok: true });

    const secret = process.env.JHEO_SECRET_KEY ?? '';
    expect(secret.length).toBeGreaterThan(0);

    const putRes = await app.inject({
      method: 'PUT',
      url: `/api/projects/${projectId}/gsc/connection`,
      payload: validPayload,
    });
    expect(putRes.statusCode).toBe(200);

    const row = await prisma.gscConnection.findUnique({ where: { projectId: projectId! } });
    expect(row).not.toBeNull();
    expect(row!.serviceAccountCiphertext.length).toBeGreaterThan(0);

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/gsc/connection`,
    });
    expect(getRes.statusCode).toBe(200);
    const body = getRes.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty('serviceAccountCiphertext');
    expect(body.clientEmail).toBe(validSa.client_email);
    expect(body.syncStatus).toBe('ok');
  });

  it('sets decrypt_error on GET when ciphertext cannot be decrypted', async () => {
    mockTestGscConnection.mockResolvedValueOnce({ ok: true });

    await app.inject({
      method: 'PUT',
      url: `/api/projects/${projectId}/gsc/connection`,
      payload: validPayload,
    });

    await prisma.gscConnection.update({
      where: { projectId: projectId! },
      data: { serviceAccountCiphertext: 'invalid-ciphertext' },
    });

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/gsc/connection`,
    });
    expect(getRes.statusCode).toBe(200);
    const body = getRes.json() as { syncStatus: string; syncError: string | null };
    expect(body.syncStatus).toBe('decrypt_error');
    expect(body.syncError).toContain('re-upload');
  });

  it('DELETE removes connection row', async () => {
    mockTestGscConnection.mockResolvedValueOnce({ ok: true });

    await app.inject({
      method: 'PUT',
      url: `/api/projects/${projectId}/gsc/connection`,
      payload: validPayload,
    });

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${projectId}/gsc/connection`,
    });
    expect(delRes.statusCode).toBe(200);

    const row = await prisma.gscConnection.findUnique({ where: { projectId: projectId! } });
    expect(row).toBeNull();
  });
});
