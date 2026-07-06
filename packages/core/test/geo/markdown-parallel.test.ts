import { describe, expect, it } from 'vitest';
import { checkMarkdownParallel } from '../../src/audit/geo/markdown-parallel.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/geo/markdown-parallel', () => {
  it('skips thin pages', async () => {
    const { ctx } = makeAuditHarness({ html: '<p>short</p>', url: 'https://x/' });
    const f = await checkMarkdownParallel(ctx);
    expect(f).toEqual([]);
  });
  it('flags missing markdown for content pages', async () => {
    const long = `<p>${'word '.repeat(400)}</p>`;
    const { ctx } = makeAuditHarness({
      html: long,
      url: 'https://x/',
      fetches: [
        {
          match: (u) => u === 'https://x/',
          respond: async () => ({ status: 200, headers: {}, text: '<html></html>' }),
        },
      ],
    });
    const f = await checkMarkdownParallel(ctx);
    expect(f.some((x) => x.rule === 'geo.markdown-parallel.absent')).toBe(true);
  });
});
