import type { AuditContext, Finding } from '../../types.js';

export const CompressionCtxKey = Symbol('compression');

export interface CompressionSample {
  total: number;
  uncompressed: number;
}

export async function checkCompression(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const c = (ctx as unknown as Record<symbol, CompressionSample | undefined>)[CompressionCtxKey];
  if (!c || c.total === 0) return out;
  if (c.uncompressed > 0) {
    out.push({
      category: 'cwv',
      severity: 'warning',
      rule: 'cwv.compression.missing',
      message: `${c.uncompressed}/${c.total} text responses lack Content-Encoding.`,
      url: ctx.url,
      evidence: { ...c },
    });
  }
  return out;
}