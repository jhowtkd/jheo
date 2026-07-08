import type { AuditContext, Finding } from '../../types.js';

const REQUIRED = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'] as const;

const OG_META_RE = new Map<string, RegExp>(
  REQUIRED.map((prop) => [
    prop,
    new RegExp(`<meta\\s+[^>]*property=["']${prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i'),
  ]),
);

const TWITTER_CARD_RE = /<meta\s+[^>]*name=["']twitter:card["']/i;

export async function checkOpenGraph(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const prop of REQUIRED) {
    if (!OG_META_RE.get(prop)!.test(ctx.html)) {
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
  if (!TWITTER_CARD_RE.test(ctx.html)) {
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
