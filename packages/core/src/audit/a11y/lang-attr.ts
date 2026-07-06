import type { AuditContext, Finding } from '../../types.js';

export async function checkLangAttr(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const m = ctx.html.match(/<html\b([^>]*)>/i);
  if (!m) {
    out.push({
      category: 'a11y',
      severity: 'error',
      rule: 'a11y.html.missing',
      message: 'Response has no <html> element.',
      url: ctx.url,
      evidence: {},
    });
    return out;
  }
  if (!/\blang\s*=/.test(m[1] ?? '')) {
    out.push({
      category: 'a11y',
      severity: 'error',
      rule: 'a11y.lang-attr.missing',
      message: '<html> element has no lang attribute.',
      url: ctx.url,
      evidence: {},
    });
  }
  return out;
}
