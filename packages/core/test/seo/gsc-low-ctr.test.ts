import { describe, expect, it } from 'vitest';
import { GSC_SNAPSHOT } from '../../src/gsc/snapshot-context.js';
import { checkGscLowCtr } from '../../src/audit/seo/gsc-low-ctr.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/seo/gsc-low-ctr', () => {
  it('returns no findings when GSC snapshot is absent', async () => {
    const { ctx } = makeAuditHarness({
      html: '<html><head><title>Test</title></head><body></body></html>',
      url: 'https://example.com/page',
    });
    expect(await checkGscLowCtr(ctx)).toEqual([]);
  });

  it('flags pages with high impressions and low CTR', async () => {
    const { ctx } = makeAuditHarness({
      html: '<html><head><title>Test</title></head><body></body></html>',
      url: 'https://example.com/page',
    });
    (ctx as Record<symbol, unknown>)[GSC_SNAPSHOT] = {
      'https://example.com/page': {
        impressions: 500,
        clicks: 5,
        ctr: 0.01,
        topQuery: 'shoes',
      },
    };
    const findings = await checkGscLowCtr(ctx);
    expect(findings).toEqual([
      expect.objectContaining({
        category: 'seo',
        severity: 'warning',
        rule: 'gsc.low-ctr',
        url: 'https://example.com/page',
        evidence: expect.objectContaining({
          impressions: 500,
          ctr: 0.01,
          query: 'shoes',
        }),
      }),
    ]);
  });

  it('no-ops when impressions are below threshold', async () => {
    const { ctx } = makeAuditHarness({
      html: '<html><head><title>Test</title></head><body></body></html>',
      url: 'https://example.com/page',
    });
    (ctx as Record<symbol, unknown>)[GSC_SNAPSHOT] = {
      'https://example.com/page': {
        impressions: 50,
        clicks: 1,
        ctr: 0.02,
        topQuery: null,
      },
    };
    expect(await checkGscLowCtr(ctx)).toEqual([]);
  });

  it('matches URLs with trailing slash normalization', async () => {
    const { ctx } = makeAuditHarness({
      html: '<html><head><title>Test</title></head><body></body></html>',
      url: 'https://example.com/page/',
    });
    (ctx as Record<symbol, unknown>)[GSC_SNAPSHOT] = {
      'https://example.com/page': {
        impressions: 200,
        clicks: 2,
        ctr: 0.01,
        topQuery: null,
      },
    };
    const findings = await checkGscLowCtr(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('gsc.low-ctr');
  });
});
