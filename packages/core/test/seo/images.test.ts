import { describe, expect, it } from 'vitest';
import { checkImages } from '../../src/audit/seo/images.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/seo/images', () => {
  it('flags missing alt', async () => {
    const html = '<img src="x.png" width="10" height="10">';
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkImages(ctx);
    expect(f.some((x) => x.rule === 'images.missing-alt')).toBe(true);
  });
  it('flags missing dimensions', async () => {
    const html = '<img src="x.png" alt="x">';
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkImages(ctx);
    expect(f.some((x) => x.rule === 'images.missing-dimensions')).toBe(true);
  });
  it('passes a clean image', async () => {
    const html = '<img src="x.png" alt="x" width="10" height="10">';
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkImages(ctx);
    expect(f).toEqual([]);
  });
});
