import { describe, expect, it } from 'vitest';
import { checkSkipLinks } from '../../src/audit/a11y/skip-links.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/a11y/skip-links', () => {
  it('flags missing skip link', async () => {
    const { ctx } = makeAuditHarness({ html: '<body><a href="/about">about</a></body>', url: 'https://x/' });
    const f = await checkSkipLinks(ctx);
    expect(f.some((x) => x.rule === 'a11y.skip-links.missing')).toBe(true);
  });
  it('accepts a skip link', async () => {
    const html = '<a href="#main">Skip to main content</a>';
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    expect(await checkSkipLinks(ctx)).toEqual([]);
  });
});
