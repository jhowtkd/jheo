import type { AuditContext, Finding } from '../../types.js';

export interface LighthouseResult {
  metrics: { LCP?: number; CLS?: number; TBT?: number; FCP?: number; SI?: number };
  scores: { performance: number };
}

export const LighthouseCtxKey = Symbol('lighthouse');

export async function checkLighthouse(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const result = (ctx as unknown as Record<symbol, LighthouseResult | undefined>)[LighthouseCtxKey];
  if (!result) {
    out.push({
      category: 'cwv',
      severity: 'info',
      rule: 'cwv.lighthouse.missing',
      message: 'Lighthouse was not run for this page (worker did not provide a result).',
      url: ctx.url,
      evidence: {},
    });
    return out;
  }
  const { metrics, scores } = result;
  const lcp = metrics.LCP ?? 0;
  const cls = metrics.CLS ?? 0;
  const tbt = metrics.TBT ?? 0;
  if (lcp > 2500) {
    out.push({
      category: 'cwv',
      severity: 'error',
      rule: 'cwv.lcp-slow',
      message: `LCP is ${lcp}ms (>2500).`,
      url: ctx.url,
      evidence: { lcp },
    });
  } else if (lcp > 1200) {
    out.push({
      category: 'cwv',
      severity: 'warning',
      rule: 'cwv.lcp-warn',
      message: `LCP is ${lcp}ms (>1200).`,
      url: ctx.url,
      evidence: { lcp },
    });
  }
  if (cls > 0.25) {
    out.push({
      category: 'cwv',
      severity: 'error',
      rule: 'cwv.cls-high',
      message: `CLS is ${cls.toFixed(3)} (>0.25).`,
      url: ctx.url,
      evidence: { cls },
    });
  }
  if (tbt > 600) {
    out.push({
      category: 'cwv',
      severity: 'warning',
      rule: 'cwv.tbt-high',
      message: `TBT is ${tbt}ms (>600).`,
      url: ctx.url,
      evidence: { tbt },
    });
  }
  if (scores.performance < 0.5) {
    out.push({
      category: 'cwv',
      severity: 'error',
      rule: 'cwv.performance-poor',
      message: `Lighthouse performance score is ${Math.round(scores.performance * 100)}.`,
      url: ctx.url,
      evidence: { score: scores.performance },
    });
  }
  return out;
}