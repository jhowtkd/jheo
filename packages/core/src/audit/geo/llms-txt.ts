import type { AuditContext, Finding } from '../../types.js';

export async function checkLlmsTxt(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  let res;
  try {
    res = await ctx.fetchText(new URL('/llms.txt', ctx.url).toString());
  } catch {
    return out;
  }
  if (res.status === 404) {
    out.push({
      category: 'geo',
      severity: 'info',
      rule: 'geo.llms-txt.missing',
      message: '/llms.txt not found; consider publishing one to help AI engines discover content.',
      url: ctx.url,
      evidence: {},
    });
    return out;
  }
  if (res.status !== 200) {
    return out;
  }
  if (!/^#\s+\S/m.test(res.text)) {
    out.push({
      category: 'geo',
      severity: 'warning',
      rule: 'geo.llms-txt.no-h1',
      message: '/llms.txt has no H1; expected markdown with a top-level title.',
      url: ctx.url,
      evidence: {},
    });
  }
  if (!/\[[^\]]+\]\([^)]+\)/.test(res.text)) {
    out.push({
      category: 'geo',
      severity: 'info',
      rule: 'geo.llms-txt.no-links',
      message: '/llms.txt lists no named pages.',
      url: ctx.url,
      evidence: {},
    });
  }
  return out;
}
