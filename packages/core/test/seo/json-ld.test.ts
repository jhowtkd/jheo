import { describe, expect, it } from 'vitest';
import { checkJsonLd } from '../../src/audit/seo/json-ld.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/seo/json-ld', () => {
  it('flags none present', async () => {
    const { ctx } = makeAuditHarness({ html: '<html></html>', url: 'https://x/' });
    const f = await checkJsonLd(ctx);
    expect(f.some((x) => x.rule === 'json-ld.none')).toBe(true);
  });
  it('flags invalid JSON', async () => {
    const html = `<script type="application/ld+json">{ broken }</script>`;
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkJsonLd(ctx);
    expect(f.some((x) => x.rule === 'json-ld.invalid')).toBe(true);
  });
  it('passes a valid block', async () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme"}</script>`;
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkJsonLd(ctx);
    expect(f).toEqual([]);
  });
});
