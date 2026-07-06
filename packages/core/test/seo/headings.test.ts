import { describe, expect, it } from 'vitest';
import { checkHeadings } from '../../src/audit/seo/headings.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/seo/headings', () => {
  it('flags missing h1', async () => {
    const { ctx } = makeAuditHarness({ html: '<html><body><h2>x</h2></body></html>', url: 'https://x/' });
    const f = await checkHeadings(ctx);
    expect(f.some((x) => x.rule === 'headings.missing-h1')).toBe(true);
  });
  it('flags multiple h1', async () => {
    const html = '<html><body><h1>a</h1><h1>b</h1></body></html>';
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkHeadings(ctx);
    expect(f.some((x) => x.rule === 'headings.multiple-h1')).toBe(true);
  });
  it('flags skipped level', async () => {
    const html = '<html><body><h1>a</h1><h3>c</h3></body></html>';
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkHeadings(ctx);
    expect(f.some((x) => x.rule === 'headings.skipped-level')).toBe(true);
  });
  it('passes on clean hierarchy', async () => {
    const html = '<html><body><h1>a</h1><h2>b</h2><h3>c</h3></body></html>';
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkHeadings(ctx);
    expect(f).toEqual([]);
  });
});
