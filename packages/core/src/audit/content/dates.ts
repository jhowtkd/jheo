import type { AuditContext, Finding } from '../../types.js';

export async function checkDates(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const hasSchemaDate =
    /"datePublished"\s*:\s*"[^"]+"/.test(ctx.html) ||
    /"dateModified"\s*:\s*"[^"]+"/.test(ctx.html);
  const hasVisibleDate = /\b(20\d{2}-\d{2}-\d{2}|[A-Z][a-z]+ \d{1,2}, 20\d{2})\b/.test(ctx.html);
  if (!hasSchemaDate && !hasVisibleDate) {
    out.push({
      category: 'content',
      severity: 'info',
      rule: 'content.dates.absent',
      message: 'Page has no visible or schema-encoded publish/modify date.',
      url: ctx.url,
      evidence: {},
    });
  }
  return out;
}
