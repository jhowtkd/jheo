import type { PrismaClient } from '@prisma/client';
import { normalizeGscPageUrl, type GscSnapshotContext } from '@jheo/core';

const RECENT_DAYS = 7;

export async function buildGscSnapshotContext(
  prisma: PrismaClient,
  projectId: string,
): Promise<GscSnapshotContext | undefined> {
  const connection = await prisma.gscConnection.findUnique({ where: { projectId } });
  if (!connection || connection.syncStatus !== 'ok') return undefined;

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - RECENT_DAYS);

  const grouped = await prisma.gscSnapshot.groupBy({
    by: ['page'],
    where: { projectId, date: { gte: cutoff } },
    _sum: { impressions: true, clicks: true },
  });
  if (grouped.length === 0) return undefined;

  const queryRows = await prisma.gscSnapshot.groupBy({
    by: ['page', 'query'],
    where: { projectId, date: { gte: cutoff } },
    _sum: { impressions: true },
    orderBy: { _sum: { impressions: 'desc' } },
  });

  const topQueryByPage = new Map<string, string>();
  for (const row of queryRows) {
    const key = normalizeGscPageUrl(row.page);
    if (!topQueryByPage.has(key)) {
      topQueryByPage.set(key, row.query);
    }
  }

  const result: GscSnapshotContext = {};
  for (const row of grouped) {
    const impressions = row._sum.impressions ?? 0;
    const clicks = row._sum.clicks ?? 0;
    const key = normalizeGscPageUrl(row.page);
    result[key] = {
      impressions,
      clicks,
      ctr: impressions > 0 ? clicks / impressions : 0,
      topQuery: topQueryByPage.get(key) ?? null,
    };
  }
  return result;
}
