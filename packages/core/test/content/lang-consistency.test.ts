import { describe, expect, it } from 'vitest';
import { checkLangConsistency } from '../../src/audit/content/lang-consistency.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/content/lang-consistency', () => {
  it('flags mismatch pt declared but English content', async () => {
    const body = 'the and with this that are from for word word word word word';
    const html = `<html lang="pt"><body><p>${body}</p></body></html>`;
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkLangConsistency(ctx);
    expect(f.some((x) => x.rule === 'content.lang.mismatch')).toBe(true);
  });
  it('passes consistent', async () => {
    const html = '<html lang="en"><body><p>the and with this</p></body></html>';
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    expect(await checkLangConsistency(ctx)).toEqual([]);
  });
});
