import type { AuditContext, Finding } from '../../types.js';
import { jsonLdBlocks } from '../derived.js';

export async function checkJsonLd(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const blocks = jsonLdBlocks(ctx);
  if (blocks.length === 0) {
    out.push({
      category: 'seo',
      severity: 'info',
      rule: 'json-ld.none',
      message: 'Page has no JSON-LD structured data.',
      url: ctx.url,
      evidence: {},
    });
    return out;
  }
  for (const m of blocks) {
    const body = m[1];
    if (!body) continue;
    try {
      JSON.parse(body);
    } catch {
      out.push({
        category: 'seo',
        severity: 'error',
        rule: 'json-ld.invalid',
        message: 'A JSON-LD block is not valid JSON.',
        url: ctx.url,
        evidence: { snippet: body.slice(0, 200) },
      });
    }
  }
  return out;
}
