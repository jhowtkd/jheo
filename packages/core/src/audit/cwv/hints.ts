import type { AuditContext, Finding } from '../../types.js';

export async function checkHints(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const hasPreconnect = /<link\s+rel=["']preconnect["']/i.test(ctx.html);
  const hasPreload = /<link\s+rel=["']preload["']/i.test(ctx.html);
  if (!hasPreconnect && !hasPreload) {
    out.push({
      category: 'cwv',
      severity: 'info',
      rule: 'cwv.hints.none',
      message: 'Page declares no preconnect or preload resource hints.',
      url: ctx.url,
      evidence: {},
    });
  }
  return out;
}
