import type { AuditContext, Finding } from '../../types.js';

const REQUIRED = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'];

export async function checkOpenGraph(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const prop of REQUIRED) {
    const re = new RegExp(`<meta\\s+[^>]*property=["']${prop}["']`, 'i');
    if (!re.test(ctx.html)) {
      out.push({
        category: 'seo',
        severity: 'warning',
        rule: `open-graph.missing-${prop}`,
        message: `Page is missing the ${prop} meta property.`,
        url: ctx.url,
        evidence: { property: prop },
      });
    }
  }
  if (!/<meta\s+[^>]*name=["']twitter:card["']/i.test(ctx.html)) {
    out.push({
      category: 'seo',
      severity: 'info',
      rule: 'open-graph.missing-twitter-card',
      message: 'Page is missing twitter:card meta tag.',
      url: ctx.url,
      evidence: {},
    });
  }
  return out;
}
