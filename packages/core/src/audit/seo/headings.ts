import type { AuditContext, Finding } from '../../types.js';

export async function checkHeadings(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const headings = Array.from(ctx.html.matchAll(/<h([1-6])\b[^>]*>([^<]*)<\/h\1>/gi));
  const h1s = headings.filter((m) => m[1] === '1');
  if (h1s.length === 0) {
    out.push({
      category: 'seo',
      severity: 'error',
      rule: 'headings.missing-h1',
      message: 'Page has no <h1> element.',
      url: ctx.url,
      evidence: {},
    });
  } else if (h1s.length > 1) {
    out.push({
      category: 'seo',
      severity: 'warning',
      rule: 'headings.multiple-h1',
      message: `Page has ${h1s.length} <h1> elements; one is recommended.`,
      url: ctx.url,
      evidence: { h1Count: h1s.length },
    });
  }
  const levels = headings.map((m) => Number(m[1]));
  for (let i = 1; i < levels.length; i++) {
    const prev = levels[i - 1];
    const cur = levels[i];
    if (prev === undefined || cur === undefined) continue;
    if (cur > prev + 1) {
      out.push({
        category: 'seo',
        severity: 'warning',
        rule: 'headings.skipped-level',
        message: `Heading level skipped between <h${prev}> and <h${cur}>.`,
        url: ctx.url,
        evidence: {},
      });
      break;
    }
  }
  return out;
}
