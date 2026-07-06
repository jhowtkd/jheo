import type { AuditContext, Finding } from '../../types.js';

export async function checkCitability(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const has = (re: RegExp) => re.test(ctx.html);
  const score = {
    blockquote: has(/<blockquote\b/i),
    ol: has(/<ol\b/i),
    table: has(/<table\b[\s\S]*?<th\b/i),
    isoDate: has(/\b20\d{2}-\d{2}-\d{2}\b/),
    author: has(/\bby\s+[A-Z][a-z]+/),
  };
  const present = Object.values(score).filter(Boolean).length;
  if (present < 2) {
    out.push({
      category: 'geo',
      severity: 'info',
      rule: 'geo.citability.low',
      message: 'Page has few citability signals (blockquotes, lists, tables, dates, authors).',
      url: ctx.url,
      evidence: score,
    });
  }
  return out;
}
