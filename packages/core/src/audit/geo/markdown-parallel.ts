import type { AuditContext, Finding } from '../../types.js';
import { plainTextWords } from '../derived.js';

export async function checkMarkdownParallel(ctx: AuditContext): Promise<Finding[]> {
  const wordCount = plainTextWords(ctx).length;
  if (wordCount < 300) return [];
  const out: Finding[] = [];
  let res;
  try {
    res = await ctx.fetchText(ctx.url, {
      headers: { Accept: 'text/markdown' },
    });
  } catch {
    return out;
  }
  if (res.status !== 200) {
    out.push({
      category: 'geo',
      severity: 'info',
      rule: 'geo.markdown-parallel.absent',
      message: 'Page has no markdown representation served with Accept: text/markdown.',
      url: ctx.url,
      evidence: {},
    });
    return out;
  }
  // Even a 200 may be HTML reflection of the same page rather than a
  // markdown representation, so check the body really is markdown.
  const looksHtml = res.text.trimStart().startsWith('<');
  if (looksHtml) {
    out.push({
      category: 'geo',
      severity: 'info',
      rule: 'geo.markdown-parallel.absent',
      message: 'Page has no markdown representation served with Accept: text/markdown.',
      url: ctx.url,
      evidence: {},
    });
  }
  return out;
}
