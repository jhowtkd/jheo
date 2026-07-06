import type { AuditContext, Finding } from '../../types.js';

export async function checkRobotsTxt(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  let res;
  try {
    res = await ctx.fetchText(new URL('/robots.txt', ctx.url).toString());
  } catch {
    return [
      {
        category: 'seo',
        severity: 'warning',
        rule: 'robots.unreachable',
        message: '/robots.txt could not be fetched.',
        url: ctx.url,
        evidence: {},
      },
    ];
  }
  if (res.status !== 200) {
    out.push({
      category: 'seo',
      severity: 'warning',
      rule: 'robots.missing',
      message: `/robots.txt returned HTTP ${res.status}.`,
      url: ctx.url,
      evidence: {},
    });
    return out;
  }
  if (/^Disallow:\s*\/\s*$/m.test(res.text)) {
    out.push({
      category: 'seo',
      severity: 'error',
      rule: 'robots.disallow-all',
      message: 'robots.txt disallows the entire site.',
      url: ctx.url,
      evidence: {},
    });
  }
  if (!/^Sitemap:/m.test(res.text)) {
    out.push({
      category: 'seo',
      severity: 'info',
      rule: 'robots.no-sitemap-directive',
      message: 'robots.txt has no Sitemap: directive.',
      url: ctx.url,
      evidence: {},
    });
  }
  return out;
}
