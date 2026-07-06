import { describe, expect, it } from 'vitest';
import { checkAxe, AxeCtxKey } from '../../src/audit/a11y/axe-core.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/a11y/axe-core', () => {
  it('emits a finding per violation', async () => {
    const { ctx } = makeAuditHarness({ html: '', url: 'https://x/' });
    (ctx as unknown as Record<symbol, unknown>)[AxeCtxKey] = [
      { rule: 'color-contrast', impact: 'serious', help: 'low contrast', target: ['body p'] },
    ];
    const f = await checkAxe(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ rule: 'a11y.axe.color-contrast', severity: 'error', selector: 'body p' });
  });
});
