import { describe, expect, it } from 'vitest';
import { checkSitemap } from '../../src/audit/seo/sitemap.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/seo/sitemap', () => {
  it('flags a missing sitemap', async () => {
    const { ctx } = makeAuditHarness({
      html: '<html></html>',
      url: 'https://example.com/',
      fetches: [
        {
          match: (u) => u.endsWith('/sitemap.xml'),
          respond: async () => ({ status: 404, headers: {}, text: '' }),
        },
      ],
    });
    const f = await checkSitemap(ctx);
    expect(f.some((x) => x.rule === 'sitemap.missing')).toBe(true);
  });
  it('accepts a valid sitemap', async () => {
    const xml = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/</loc></url></urlset>`;
    const { ctx } = makeAuditHarness({
      html: '',
      url: 'https://example.com/',
      fetches: [
        {
          match: (u) => u.endsWith('/sitemap.xml'),
          respond: async () => ({ status: 200, headers: { 'content-type': 'application/xml' }, text: xml }),
        },
      ],
    });
    const f = await checkSitemap(ctx);
    expect(f).toEqual([]);
  });
});
