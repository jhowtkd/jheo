import { describe, expect, it } from 'vitest';
import { checkOpenGraph } from '../../src/audit/seo/open-graph.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/seo/open-graph', () => {
  it('flags missing og:title', async () => {
    const { ctx } = makeAuditHarness({ html: '<html></html>', url: 'https://x/' });
    const f = await checkOpenGraph(ctx);
    expect(f.some((x) => x.rule === 'open-graph.missing-og:title')).toBe(true);
  });
  it('passes with all required tags', async () => {
    const html = `
      <meta property="og:title" content="t">
      <meta property="og:description" content="d">
      <meta property="og:image" content="i">
      <meta property="og:url" content="u">
      <meta property="og:type" content="website">
      <meta name="twitter:card" content="summary_large_image">
    `;
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkOpenGraph(ctx);
    expect(f).toEqual([]);
  });
});
