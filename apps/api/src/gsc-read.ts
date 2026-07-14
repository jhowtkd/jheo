import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

export const GscDaysQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(28).default(28),
});

export const GscLimitQuerySchema = GscDaysQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type GscFreshness = {
  lastSyncedAt: Date | null;
  syncStatus: string;
  syncError: string | null;
  dataThrough: string;
  days: number;
};

export function resolveSnapshotDateRange(days: number): {
  start: Date;
  end: Date;
  dataThrough: string;
} {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - 3);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return {
    start,
    end,
    dataThrough: end.toISOString().slice(0, 10),
  };
}

export function buildFreshness(
  connection: {
    lastSyncAt: Date | null;
    syncStatus: string;
    syncError: string | null;
  },
  days: number,
): GscFreshness {
  const { dataThrough } = resolveSnapshotDateRange(days);
  return {
    lastSyncedAt: connection.lastSyncAt,
    syncStatus: connection.syncStatus,
    syncError: connection.syncError,
    dataThrough,
    days,
  };
}

export async function fetchGscOverview(prisma: PrismaClient, projectId: string, days: number) {
  const { start, end } = resolveSnapshotDateRange(days);
  const [agg, rowCount] = await Promise.all([
    prisma.gscSnapshot.aggregate({
      where: { projectId, date: { gte: start, lte: end } },
      _sum: { clicks: true, impressions: true },
      _avg: { position: true },
    }),
    prisma.gscSnapshot.count({
      where: { projectId, date: { gte: start, lte: end } },
    }),
  ]);

  const clicks = agg._sum.clicks ?? 0;
  const impressions = agg._sum.impressions ?? 0;
  const ctr = impressions > 0 ? clicks / impressions : 0;

  return {
    clicks,
    impressions,
    ctr,
    position: agg._avg.position ?? 0,
    rowCount,
  };
}

export async function fetchGscTopQueries(
  prisma: PrismaClient,
  projectId: string,
  days: number,
  limit: number,
) {
  const { start, end } = resolveSnapshotDateRange(days);
  const grouped = await prisma.gscSnapshot.groupBy({
    by: ['query'],
    where: { projectId, date: { gte: start, lte: end } },
    _sum: { clicks: true, impressions: true },
    _avg: { position: true },
    orderBy: { _sum: { clicks: 'desc' } },
    take: limit,
  });

  return grouped.map((row) => {
    const clicks = row._sum.clicks ?? 0;
    const impressions = row._sum.impressions ?? 0;
    return {
      query: row.query,
      clicks,
      impressions,
      ctr: impressions > 0 ? clicks / impressions : 0,
      position: row._avg.position ?? 0,
    };
  });
}

export async function fetchGscTopPages(
  prisma: PrismaClient,
  projectId: string,
  days: number,
  limit: number,
) {
  const { start, end } = resolveSnapshotDateRange(days);
  const grouped = await prisma.gscSnapshot.groupBy({
    by: ['page'],
    where: { projectId, date: { gte: start, lte: end } },
    _sum: { clicks: true, impressions: true },
    _avg: { position: true },
    orderBy: { _sum: { clicks: 'desc' } },
    take: limit,
  });

  return grouped.map((row) => {
    const clicks = row._sum.clicks ?? 0;
    const impressions = row._sum.impressions ?? 0;
    return {
      page: row.page,
      clicks,
      impressions,
      ctr: impressions > 0 ? clicks / impressions : 0,
      position: row._avg.position ?? 0,
    };
  });
}
