import { describe, expect, it } from 'vitest';
import { checkRequests, RequestsCtxKey } from '../../src/audit/cwv/requests.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/cwv/requests', () => {
  it('no findings without data', async () => {
    const { ctx } = makeAuditHarness({ html: '', url: 'https://x/' });
    expect(await checkRequests(ctx)).toEqual([]);
  });
  it('flags high render-blocking', async () => {
    const { ctx } = makeAuditHarness({ html: '', url: 'https://x/' });
    (ctx as unknown as Record<symbol, unknown>)[RequestsCtxKey] = {
      total: 50, renderBlocking: 9, duplicateUrls: 2, non2xx: 1,
    };
    const f = await checkRequests(ctx);
    expect(f.some((x) => x.rule === 'cwv.requests.render-blocking')).toBe(true);
    expect(f.some((x) => x.rule === 'cwv.requests.duplicates')).toBe(true);
    expect(f.some((x) => x.rule === 'cwv.requests.non-2xx')).toBe(true);
  });
});