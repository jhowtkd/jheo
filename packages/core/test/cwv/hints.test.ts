import { describe, expect, it } from 'vitest';
import { checkHints } from '../../src/audit/cwv/hints.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/cwv/hints', () => {
  it('flags missing hints', async () => {
    const { ctx } = makeAuditHarness({ html: '<p>x</p>', url: 'https://x/' });
    const f = await checkHints(ctx);
    expect(f.some((x) => x.rule === 'cwv.hints.none')).toBe(true);
  });
  it('accepts a page with preload', async () => {
    const html = `<link rel="preload" href="/a.css" as="style">`;
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    expect(await checkHints(ctx)).toEqual([]);
  });
});