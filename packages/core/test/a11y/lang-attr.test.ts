import { describe, expect, it } from 'vitest';
import { checkLangAttr } from '../../src/audit/a11y/lang-attr.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/a11y/lang-attr', () => {
  it('flags missing lang', async () => {
    const { ctx } = makeAuditHarness({ html: '<html><body></body></html>', url: 'https://x/' });
    const f = await checkLangAttr(ctx);
    expect(f.some((x) => x.rule === 'a11y.lang-attr.missing')).toBe(true);
  });
  it('passes with lang', async () => {
    const { ctx } = makeAuditHarness({ html: '<html lang="en"><body></body></html>', url: 'https://x/' });
    expect(await checkLangAttr(ctx)).toEqual([]);
  });
});
