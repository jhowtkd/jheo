import { describe, expect, it } from 'vitest';
import { checkSchemaCoverage } from '../../src/audit/geo/schema-coverage.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/geo/schema-coverage', () => {
  it('flags tiny schema on a large page', async () => {
    const big = `<p>${'word '.repeat(2000)}</p>`;
    const html = `${big}<script type="application/ld+json">{"@type":"Organization"}</script>`;
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkSchemaCoverage(ctx);
    expect(f.some((x) => x.rule === 'geo.schema.coverage.low')).toBe(true);
  });
});
