import { describe, expect, it } from 'vitest';
import { checkDates } from '../../src/audit/content/dates.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/content/dates', () => {
  it('flags absence', async () => {
    const { ctx } = makeAuditHarness({ html: '<p>no date here</p>', url: 'https://x/' });
    const f = await checkDates(ctx);
    expect(f.some((x) => x.rule === 'content.dates.absent')).toBe(true);
  });
  it('accepts ISO date', async () => {
    const html = '<p>Published 2024-06-01</p>';
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    expect(await checkDates(ctx)).toEqual([]);
  });
});
