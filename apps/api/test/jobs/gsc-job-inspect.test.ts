import { describe, expect, it, vi } from 'vitest';
import { makeGscHandler } from '../../src/jobs/gsc-job.js';

const validSa = {
  type: 'service_account',
  client_email: 'sa@test.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
  project_id: 'test-project',
};

describe('gsc-job inspect', () => {
  it('logs inspection verdict and writes publish event when publishId is set', async () => {
    const publishEventCreate = vi.fn().mockResolvedValue({});
    const jobLog = vi.fn().mockResolvedValue(undefined);

    const prisma = {
      gscConnection: {
        findUnique: vi.fn().mockResolvedValue({
          projectId: 'proj1',
          siteUrl: 'https://example.com/',
          serviceAccountCiphertext: 'cipher',
        }),
      },
      publishEvent: { create: publishEventCreate },
    };

    const fetchFn = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          inspectionResult: {
            indexStatusResult: { verdict: 'PASS' },
          },
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
      data: {
        action: 'inspect',
        projectId: 'proj1',
        inspectionUrl: 'https://example.com/new-post',
        publishId: 'pub1',
      },
      log: jobLog,
    } as never);

    expect(jobLog).toHaveBeenCalledWith(
      expect.stringContaining('verdict=PASS'),
    );
    expect(publishEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          publishId: 'pub1',
          message: expect.stringContaining('GSC URL Inspection'),
        }),
      }),
    );
  });

  it('skips inspect when no GSC connection exists', async () => {
    const jobLog = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      gscConnection: { findUnique: vi.fn().mockResolvedValue(null) },
    };

    const handler = makeGscHandler({
      prisma: prisma as never,
      decrypt: vi.fn(),
      fetchFn: vi.fn() as never,
      secretKey: 'secret-key',
    });

    await handler({
      data: {
        action: 'inspect',
        projectId: 'proj1',
        inspectionUrl: 'https://example.com/post',
      },
      log: jobLog,
    } as never);

    expect(jobLog).toHaveBeenCalledWith(expect.stringContaining('skipped'));
  });
});
