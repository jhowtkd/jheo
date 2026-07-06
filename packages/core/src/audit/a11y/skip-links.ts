import type { AuditContext, Finding } from '../../types.js';

export async function checkSkipLinks(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  if (!/href=["']#[\w-]+["'][^>]*>\s*(skip to|skip|ir para|pular para)/i.test(ctx.html)) {
    out.push({
      category: 'a11y',
      severity: 'info',
      rule: 'a11y.skip-links.missing',
      message: 'Page has no visible skip-to-main-content link.',
      url: ctx.url,
      evidence: {},
    });
  }
  return out;
}
