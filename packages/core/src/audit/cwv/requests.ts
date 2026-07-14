import type { AuditContext, Finding } from '../../types.js';

export const RequestsCtxKey = Symbol('requests');

export interface RequestSummary {
  total: number;
  renderBlocking: number;
  duplicateUrls: number;
  non2xx: number;
}

export async function checkRequests(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const r = (ctx as unknown as Record<symbol, RequestSummary | undefined>)[RequestsCtxKey];
  if (!r) return out;
  if (r.renderBlocking > 5) {
    out.push({
      category: 'cwv',
      severity: 'warning',
      rule: 'cwv.requests.render-blocking',
      message: `${r.renderBlocking} render-blocking resources detected.`,
      url: ctx.url,
      evidence: { ...r },
    });
  }
  if (r.duplicateUrls > 0) {
    out.push({
      category: 'cwv',
      severity: 'info',
      rule: 'cwv.requests.duplicates',
      message: `${r.duplicateUrls} duplicate URL(s) requested.`,
      url: ctx.url,
      evidence: { ...r },
    });
  }
  if (r.non2xx > 0) {
    out.push({
      category: 'cwv',
      severity: 'warning',
      rule: 'cwv.requests.non-2xx',
      message: `${r.non2xx} non-2xx subresource responses.`,
      url: ctx.url,
      evidence: { ...r },
    });
  }
  return out;
}
