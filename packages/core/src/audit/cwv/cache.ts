import type { AuditContext, Finding } from '../../types.js';

export const CacheCtxKey = Symbol('cache');

export interface CacheSample {
  total: number;
  missingCacheControl: number;
}

export async function checkCache(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const c = (ctx as unknown as Record<symbol, CacheSample | undefined>)[CacheCtxKey];
  if (!c || c.total === 0) return out;
  const ratio = c.missingCacheControl / c.total;
  if (ratio > 0.2) {
    out.push({
      category: 'cwv',
      severity: 'warning',
      rule: 'cwv.cache.many-missing',
      message: `${c.missingCacheControl}/${c.total} static assets lack Cache-Control.`,
      url: ctx.url,
      evidence: { ...c },
    });
  }
  return out;
}