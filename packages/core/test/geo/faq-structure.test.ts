import { describe, expect, it } from 'vitest';
import { checkFaqStructure } from '../../src/audit/geo/faq-structure.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/geo/faq-structure', () => {
  it('flags visible FAQ without schema', async () => {
    const html = `<details><summary>Q</summary><p>A</p></details>`;
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkFaqStructure(ctx);
    expect(f.some((x) => x.rule === 'geo.faq.no-schema')).toBe(true);
  });
  it('passes visible FAQ with schema', async () => {
    const html = `
      <details><summary>Q</summary><p>A</p></details>
      <script type="application/ld+json">{"@type":"FAQPage"}</script>
    `;
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkFaqStructure(ctx);
    expect(f).toEqual([]);
  });
});
