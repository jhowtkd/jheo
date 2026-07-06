import { describe, expect, it } from 'vitest';
import { checkCompression, CompressionCtxKey } from '../../src/audit/cwv/compression.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/cwv/compression', () => {
  it('flags missing compression', async () => {
    const { ctx } = makeAuditHarness({ html: '', url: 'https://x/' });
    (ctx as unknown as Record<symbol, unknown>)[CompressionCtxKey] = { total: 5, uncompressed: 3 };
    const f = await checkCompression(ctx);
    expect(f.some((x) => x.rule === 'cwv.compression.missing')).toBe(true);
  });
});