import type { AuditContext, Finding } from '../../types.js';
import { lookupGscPageMetrics } from '../../gsc/snapshot-context.js';

const MIN_IMPRESSIONS = 100;
const MAX_CTR = 0.02;

export async function checkGscLowCtr(ctx: AuditContext): Promise<Finding[]> {
  const metrics = lookupGscPageMetrics(ctx as unknown as Record<symbol, unknown>, ctx.url);
  if (!metrics) return [];

  if (metrics.impressions <= MIN_IMPRESSIONS || metrics.ctr >= MAX_CTR) {
    return [];
  }

  return [
    {
      category: 'seo',
      severity: 'warning',
      rule: 'gsc.low-ctr',
      message: `Page has strong impressions (${metrics.impressions}) but low CTR (${(metrics.ctr * 100).toFixed(1)}%). Review title and meta description.`,
      url: ctx.url,
      evidence: {
        impressions: metrics.impressions,
        ctr: metrics.ctr,
        clicks: metrics.clicks,
        ...(metrics.topQuery ? { query: metrics.topQuery } : {}),
      },
    },
  ];
}
