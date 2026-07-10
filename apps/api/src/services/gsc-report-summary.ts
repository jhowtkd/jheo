import type { PrismaClient } from '@prisma/client';
import type { GscReportSummary } from '@jheo/core';

const PERIOD_DAYS = 28;

export async function buildGscReportSummary(
  prisma: PrismaClient,
  projectId: string,
): Promise<GscReportSummary | undefined> {
  const connection = await prisma.gscConnection.findUnique({
    where: { projectId },
  });
  if (!connection || connection.syncStatus !== 'ok') return undefined;

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - PERIOD_DAYS);

  const [agg, queryGroups] = await Promise.all([
    prisma.gscSnapshot.aggregate({
      where: { projectId, date: { gte: cutoff } },
      _sum: { clicks: true, impressions: true },
    }),
    prisma.gscSnapshot.groupBy({
      by: ['query'],
      where: { projectId, date: { gte: cutoff } },
      _sum: { clicks: true, impressions: true },
    }),
  ]);

  const clicks = agg._sum.clicks ?? 0;
  const impressions = agg._sum.impressions ?? 0;
  const ctr = impressions > 0 ? clicks / impressions : 0;

  let lowCtrQueryCount = 0;
  for (const g of queryGroups) {
    const qImp = g._sum.impressions ?? 0;
    const qClicks = g._sum.clicks ?? 0;
    if (qImp > 100 && qImp > 0 && qClicks / qImp < 0.02) lowCtrQueryCount++;
  }

  return { clicks, impressions, ctr, lowCtrQueryCount, periodDays: PERIOD_DAYS };
}
