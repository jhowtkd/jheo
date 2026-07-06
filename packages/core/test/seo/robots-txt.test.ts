import { describe, expect, it } from 'vitest';
import { checkRobotsTxt } from '../../src/audit/seo/robots-txt.js';
import { makeAuditHarness } from '../../src/audit/context.js';

const respondWith = (text: string) => ({
  match: (u: string) => u.endsWith('/robots.txt'),
  respond: async () => ({ status: 200, headers: {}, text }),
});

describe('audit/seo/robots-txt', () => {
  it('flags disallow all', async () => {
    const { ctx } = makeAuditHarness({
      html: '',
      url: 'https://example.com/',
      fetches: [respondWith('User-agent: *\nDisallow: /\n')],
    });
    const f = await checkRobotsTxt(ctx);
    expect(f.some((x) => x.rule === 'robots.disallow-all')).toBe(true);
  });
  it('flags missing sitemap directive', async () => {
    const { ctx } = makeAuditHarness({
      html: '',
      url: 'https://example.com/',
      fetches: [respondWith('User-agent: *\nAllow: /\n')],
    });
    const f = await checkRobotsTxt(ctx);
    expect(f.some((x) => x.rule === 'robots.no-sitemap-directive')).toBe(true);
  });
  it('accepts clean robots.txt', async () => {
    const { ctx } = makeAuditHarness({
      html: '',
      url: 'https://example.com/',
      fetches: [respondWith('User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml\n')],
    });
    const f = await checkRobotsTxt(ctx);
    expect(f).toEqual([]);
  });
});
