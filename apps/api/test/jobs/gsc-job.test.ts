import { describe, expect, it, vi } from 'vitest';
import { makeGscHandler } from '../../src/jobs/gsc-job.js';

const validSa = {
  type: 'service_account',
  client_email: 'sa@test.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
  project_id: 'test-project',
};

describe('gsc-job snapshot', () => {
  it('upserts snapshot rows and marks connection ok', async () => {
    const gscConnectionUpdate = vi.fn().mockResolvedValue({});
    const gscSnapshotUpsert = vi.fn().mockResolvedValue({});
    const gscSnapshotDeleteMany = vi.fn().mockResolvedValue({ count: 0 });

    const prisma = {
      gscConnection: {
        findUnique: vi.fn().mockResolvedValue({
          projectId: 'proj1',
          siteUrl: 'https://example.com/',
          serviceAccountCiphertext: 'cipher',
          syncStatus: 'idle',
        }),
        update: gscConnectionUpdate,
      },
      gscSnapshot: {
        upsert: gscSnapshotUpsert,
        deleteMany: gscSnapshotDeleteMany,
      },
      $transaction: vi.fn(async (ops: unknown[]) => {
        for (const op of ops) await op;
      }),
    };

    const fetchFn = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          rows: [
            {
              keys: ['2024-01-01', 'shoes', 'https://example.com/', 'DESKTOP', 'usa'],
              clicks: 5,
              impressions: 50,
              ctr: 0.1,
              position: 2,
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const handler = makeGscHandler({
      prisma: prisma as never,
      decrypt: vi.fn().mockReturnValue(JSON.stringify(validSa)),
      fetchFn: fetchFn as never,
      secretKey: 'secret-key',
      getAccessToken: vi.fn().mockResolvedValue('token-123'),
    });

    await handler({
      data: { action: 'snapshot', projectId: 'proj1' },
    } as never);

    expect(gscConnectionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: 'proj1' },
        data: expect.objectContaining({ syncStatus: 'syncing' }),
      }),
    );
    expect(gscSnapshotUpsert).toHaveBeenCalled();
    expect(gscSnapshotDeleteMany).toHaveBeenCalled();
    expect(gscConnectionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ syncStatus: 'ok', syncError: null }),
      }),
    );
  });

  it('sets failed status on sync error without swallowing throw', async () => {
    const gscConnectionUpdate = vi.fn().mockResolvedValue({});

    const prisma = {
      gscConnection: {
        findUnique: vi.fn().mockResolvedValue({
          projectId: 'proj1',
          siteUrl: 'https://example.com/',
          serviceAccountCiphertext: 'cipher',
        }),
        update: gscConnectionUpdate,
      },
      gscSnapshot: {
        upsert: vi.fn(),
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn(),
    };

    const handler = makeGscHandler({
      prisma: prisma as never,
      decrypt: vi.fn().mockImplementation(() => {
        throw new Error('decrypt failed');
      }),
      fetchFn: vi.fn() as never,
      secretKey: 'secret-key',
    });

    await expect(
      handler({ data: { action: 'snapshot', projectId: 'proj1' } } as never),
    ).rejects.toThrow('decrypt failed');

    expect(gscConnectionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ syncStatus: 'failed', syncError: 'decrypt failed' }),
      }),
    );
  });
});
