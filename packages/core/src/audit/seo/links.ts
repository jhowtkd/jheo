import type { AuditContext, Finding } from '../../types.js';

export async function checkLinks(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const anchors = Array.from(ctx.html.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi));
  if (anchors.length === 0) {
    out.push({
      category: 'seo',
      severity: 'info',
      rule: 'links.none',
      message: 'Page contains no <a> elements.',
      url: ctx.url,
      evidence: {},
    });
  }
  const external = anchors.filter((m) => {
    const href = m[1] ?? '';
    return /^https?:\/\//i.test(href);
  });
  if (external.length > 100) {
    out.push({
      category: 'seo',
      severity: 'info',
      rule: 'links.too-many-external',
      message: `Page has ${external.length} external links; consider if they are all necessary.`,
      url: ctx.url,
      evidence: { count: external.length },
    });
  }
  return out;
}
