import { describe, expect, it } from 'vitest';
import { checkLighthouse, LighthouseCtxKey } from '../../src/audit/cwv/lighthouse.js';
import { makeAuditHarness } from '../../src/audit/context.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/lighthouse-report.json'), 'utf8'),
) as { metrics: Record<string, number>; scores: { performance: number } };

describe('audit/cwv/lighthouse', () => {
  it('reports the absence of Lighthouse data', async () => {
    const { ctx } = makeAuditHarness({ html: '', url: 'https://x/' });
    const f = await checkLighthouse(ctx);
    expect(f.some((x) => x.rule === 'cwv.lighthouse.missing')).toBe(true);
  });

  it('flags slow LCP, high CLS, high TBT, poor performance score', async () => {
    const { ctx } = makeAuditHarness({ html: '', url: 'https://x/' });
    (ctx as unknown as Record<symbol, unknown>)[LighthouseCtxKey] = fixture;
    const f = await checkLighthouse(ctx);
    expect(f.some((x) => x.rule === 'cwv.lcp-slow')).toBe(true);
    expect(f.some((x) => x.rule === 'cwv.cls-high')).toBe(true);
    expect(f.some((x) => x.rule === 'cwv.tbt-high')).toBe(true);
    expect(f.some((x) => x.rule === 'cwv.performance-poor')).toBe(true);
  });
});