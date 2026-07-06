import type { AuditContext, Finding } from '../../types.js';

export async function checkImages(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const imgs = Array.from(ctx.html.matchAll(/<img\b([^>]*)>/gi));
  for (const m of imgs) {
    const attrs = m[1] ?? '';
    if (!/\salt=/.test(attrs)) {
      out.push({
        category: 'seo',
        severity: 'warning',
        rule: 'images.missing-alt',
        message: '<img> element has no alt attribute.',
        url: ctx.url,
        evidence: { tag: m[0] },
      });
    }
    if (!/\bwidth=/.test(attrs) || !/\bheight=/.test(attrs)) {
      out.push({
        category: 'seo',
        severity: 'info',
        rule: 'images.missing-dimensions',
        message: '<img> is missing width and/or height attributes (helps CLS).',
        url: ctx.url,
        evidence: { tag: m[0] },
      });
    }
  }
  return out;
}
