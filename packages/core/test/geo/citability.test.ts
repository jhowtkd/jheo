import { describe, expect, it } from 'vitest';
import { checkCitability } from '../../src/audit/geo/citability.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/geo/citability', () => {
  it('flags low citability', async () => {
    const { ctx } = makeAuditHarness({ html: '<p>plain text</p>', url: 'https://x/' });
    const f = await checkCitability(ctx);
    expect(f.some((x) => x.rule === 'geo.citability.low')).toBe(true);
  });
  it('accepts a citable page', async () => {
    const html = `
      <article>
        <h1>Title</h1>
        <p>By Ada Lovelace, 2024-06-01</p>
        <blockquote cite="https://example.com">quoted</blockquote>
        <ol><li>step</li></ol>
        <table><tr><th>a</th></tr><tr><td>1</td></tr></table>
      </article>`;
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkCitability(ctx);
    expect(f).toEqual([]);
  });
});
