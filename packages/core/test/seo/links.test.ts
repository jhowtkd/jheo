import { describe, expect, it } from 'vitest';
import { checkLinks } from '../../src/audit/seo/links.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/seo/links', () => {
  it('passes a small link set', async () => {
    const html = '<a href="/a">a</a><a href="/b">b</a>';
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkLinks(ctx);
    expect(f).toEqual([]);
  });
  it('reports no anchors', async () => {
    const { ctx } = makeAuditHarness({ html: '<p>nothing</p>', url: 'https://x/' });
    const f = await checkLinks(ctx);
    expect(f.some((x) => x.rule === 'links.none')).toBe(true);
  });
});
