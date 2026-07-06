import type { AuditContext, Finding } from '../../types.js';

export async function checkSitemap(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  let res;
  try {
    res = await ctx.fetchText(new URL('/sitemap.xml', ctx.url).toString());
  } catch {
    out.push({
      category: 'seo',
      severity: 'warning',
      rule: 'sitemap.unreachable',
      message: '/sitemap.xml could not be fetched.',
      url: ctx.url,
      evidence: {},
    });
    return out;
  }
  if (res.status !== 200) {
    out.push({
      category: 'seo',
      severity: 'warning',
      rule: 'sitemap.missing',
      message: `/sitemap.xml returned HTTP ${res.status}.`,
      url: ctx.url,
      evidence: { status: res.status },
    });
    return out;
  }
  if (!/<urlset\b/i.test(res.text)) {
    out.push({
      category: 'seo',
      severity: 'error',
      rule: 'sitemap.invalid',
      message: '/sitemap.xml does not look like a valid sitemap.',
      url: ctx.url,
      evidence: {},
    });
  }
  if (!res.text.includes(new URL('/', ctx.url).toString())) {
    out.push({
      category: 'seo',
      severity: 'info',
      rule: 'sitemap.no-root',
      message: 'Sitemap does not appear to include the root URL.',
      url: ctx.url,
      evidence: {},
    });
  }
  return out;
}
