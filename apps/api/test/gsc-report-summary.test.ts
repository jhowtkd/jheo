import { describe, expect, it, vi } from 'vitest';
import { buildGscReportSummary } from '../src/services/gsc-report-summary.js';

describe('buildGscReportSummary', () => {
  it('returns undefined when no GscConnection exists', async () => {
    const prisma = {
      gscConnection: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    expect(await buildGscReportSummary(prisma as never, 'p1')).toBeUndefined();
  });

  it('returns undefined when syncStatus is not ok', async () => {
    const prisma = {
      gscConnection: {
        findUnique: vi.fn().mockResolvedValue({ syncStatus: 'failed' }),
      },
    };
    expect(await buildGscReportSummary(prisma as never, 'p1')).toBeUndefined();
  });

  it('aggregates totals and counts low-CTR queries', async () => {
    const prisma = {
      gscConnection: {
        findUnique: vi.fn().mockResolvedValue({ syncStatus: 'ok' }),
      },
      gscSnapshot: {
        aggregate: vi.fn().mockResolvedValue({
          _sum: { clicks: 150, impressions: 5000 },
        }),
        groupBy: vi
          .fn()
          .mockResolvedValue([
            { query: 'good', _sum: { clicks: 100, impressions: 2000 } },
            { query: 'low1', _sum: { clicks: 1, impressions: 200 } },
            { query: 'low2', _sum: { clicks: 2, impressions: 150 } },
            { query: 'low3', _sum: { clicks: 0, impressions: 50 } },
          ]),
      },
    };

    const result = await buildGscReportSummary(prisma as never, 'p1');
    expect(result).toEqual({
      clicks: 150,
      impressions: 5000,
      ctr: 0.03,
      lowCtrQueryCount: 2,
      periodDays: 28,
    });
  });
});
