import type { AuditContext, Finding } from '../../types.js';

export async function checkSchemaCoverage(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const schemaBlocks = Array.from(
    ctx.html.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  );
  if (schemaBlocks.length === 0) {
    return out;
  }
  const totalChars = ctx.html.length;
  const schemaChars = schemaBlocks.reduce((acc, b) => acc + (b[1]?.length ?? 0), 0);
  const ratio = totalChars === 0 ? 0 : schemaChars / totalChars;
  if (ratio < 0.005) {
    out.push({
      category: 'geo',
      severity: 'info',
      rule: 'geo.schema.coverage.low',
      message: `Schema markup covers only ${(ratio * 100).toFixed(2)}% of the page.`,
      url: ctx.url,
      evidence: { ratio },
    });
  }
  return out;
}
