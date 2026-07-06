import { describe, expect, it } from 'vitest';
import { checkLlmsTxt } from '../../src/audit/geo/llms-txt.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/geo/llms-txt', () => {
  it('reports missing llms.txt', async () => {
    const { ctx } = makeAuditHarness({
      html: '',
      url: 'https://x/',
      fetches: [
        {
          match: (u) => u.endsWith('/llms.txt'),
          respond: async () => ({ status: 404, headers: {}, text: '' }),
        },
      ],
    });
    const f = await checkLlmsTxt(ctx);
    expect(f.some((x) => x.rule === 'geo.llms-txt.missing')).toBe(true);
  });
  it('accepts a valid llms.txt', async () => {
    const text = `# My Site\n\n- [Home](https://x/)\n- [Docs](https://x/docs)\n`;
    const { ctx } = makeAuditHarness({
      html: '',
      url: 'https://x/',
      fetches: [
        {
          match: (u) => u.endsWith('/llms.txt'),
          respond: async () => ({ status: 200, headers: {}, text }),
        },
      ],
    });
    const f = await checkLlmsTxt(ctx);
    expect(f).toEqual([]);
  });
});
