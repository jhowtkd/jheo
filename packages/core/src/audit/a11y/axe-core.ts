import type { AuditContext, Finding } from '../../types.js';

export const AxeCtxKey = Symbol('axe');

export interface AxeViolation {
  rule: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical';
  help: string;
  target: string[];
}

const impactToSeverity = {
  minor: 'info',
  moderate: 'warning',
  serious: 'error',
  critical: 'error',
} as const;

export async function checkAxe(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const violations = (ctx as unknown as Record<symbol, AxeViolation[] | undefined>)[AxeCtxKey];
  if (!violations) return out;
  for (const v of violations) {
    out.push({
      category: 'a11y',
      severity: impactToSeverity[v.impact],
      rule: `a11y.axe.${v.rule}`,
      message: v.help,
      url: ctx.url,
      selector: v.target.join(' '),
      evidence: { impact: v.impact },
    });
  }
  return out;
}
