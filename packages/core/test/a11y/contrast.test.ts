import { describe, expect, it } from 'vitest';
import { checkContrast, ContrastCtxKey } from '../../src/audit/a11y/contrast.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/a11y/contrast', () => {
  it('flags low contrast', async () => {
    const { ctx } = makeAuditHarness({ html: '', url: 'https://x/' });
    (ctx as unknown as Record<symbol, unknown>)[ContrastCtxKey] = [
      { selector: 'body p', ratio: 2.5, large: false },
    ];
    const f = await checkContrast(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]?.rule).toBe('a11y.contrast.low');
  });
});
