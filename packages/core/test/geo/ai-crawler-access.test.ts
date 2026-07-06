import { describe, expect, it } from 'vitest';
import { checkAiCrawlerAccess } from '../../src/audit/geo/ai-crawler-access.js';
import { makeAuditHarness } from '../../src/audit/context.js';

const robotsFor = (text: string) => ({
  match: (u: string) => u.endsWith('/robots.txt'),
  respond: async () => ({ status: 200, headers: {}, text }),
});

describe('audit/geo/ai-crawler-access', () => {
  it('reports blocked crawlers', async () => {
    const text = `User-agent: *\nAllow: /\nUser-agent: GPTBot\nDisallow: /\n`;
    const { ctx } = makeAuditHarness({
      html: '',
      url: 'https://example.com/',
      fetches: [robotsFor(text)],
    });
    const f = await checkAiCrawlerAccess(ctx);
    expect(f.some((x) => x.rule.startsWith('geo.ai-crawler-blocked.GPTBot'))).toBe(true);
  });
  it('reports not-mentioned crawlers', async () => {
    const text = `User-agent: *\nAllow: /\n`;
    const { ctx } = makeAuditHarness({
      html: '',
      url: 'https://example.com/',
      fetches: [robotsFor(text)],
    });
    const f = await checkAiCrawlerAccess(ctx);
    expect(f.some((x) => x.rule.startsWith('geo.ai-crawler-not-mentioned.'))).toBe(true);
  });
});
