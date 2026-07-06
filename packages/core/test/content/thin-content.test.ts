import { describe, expect, it } from 'vitest';
import { checkThinContent } from '../../src/audit/content/thin-content.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/content/thin-content', () => {
  it('flags under-300 pages', async () => {
    const { ctx } = makeAuditHarness({ html: '<p>few words here</p>', url: 'https://x/' });
    const f = await checkThinContent(ctx);
    expect(f.some((x) => x.rule === 'content.thin')).toBe(true);
  });
  it('passes long pages', async () => {
    const { ctx } = makeAuditHarness({
      html: `<p>${'word '.repeat(400)}</p>`,
      url: 'https://x/',
    });
    expect(await checkThinContent(ctx)).toEqual([]);
  });
});
