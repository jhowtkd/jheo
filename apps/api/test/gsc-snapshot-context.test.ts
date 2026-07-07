import { describe, expect, it, vi } from 'vitest';
import { buildGscSnapshotContext } from '../src/gsc-snapshot-context.js';

describe('buildGscSnapshotContext', () => {
  it('returns undefined when connection is missing or not ok', async () => {
    const prisma = {
      gscConnection: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    expect(await buildGscSnapshotContext(prisma as never, 'p1')).toBeUndefined();

    prisma.gscConnection.findUnique.mockResolvedValue({ syncStatus: 'failed' });
    expect(await buildGscSnapshotContext(prisma as never, 'p1')).toBeUndefined();
  });

  it('aggregates page metrics from recent snapshots', async () => {
    const prisma = {
      gscConnection: {
        findUnique: vi.fn().mockResolvedValue({ syncStatus: 'ok' }),
      },
      gscSnapshot: {
        groupBy: vi
          .fn()
          .mockResolvedValueOnce([
            { page: 'https://example.com/page', _sum: { impressions: 200, clicks: 4 } },
          ])
          .mockResolvedValueOnce([
            { page: 'https://example.com/page', query: 'shoes', _sum: { impressions: 150 } },
          ]),
      },
    };

    const ctx = await buildGscSnapshotContext(prisma as never, 'p1');
    expect(ctx?.['https://example.com/page']).toEqual({
      impressions: 200,
      clicks: 4,
      ctr: 0.02,
      topQuery: 'shoes',
    });
  });
});
