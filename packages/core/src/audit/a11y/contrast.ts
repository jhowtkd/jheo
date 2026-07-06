import type { AuditContext, Finding } from '../../types.js';

/**
 * Note: real contrast measurement requires computed styles via a headless
 * browser. In the unit test path we accept pre-sampled pairs on the context.
 * The API/worker will attach them from Puppeteer.
 */
export const ContrastCtxKey = Symbol('contrast');

export interface ContrastSample {
  selector: string;
  ratio: number;
  large: boolean;
}

export async function checkContrast(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const samples = (ctx as unknown as Record<symbol, ContrastSample[] | undefined>)[ContrastCtxKey];
  if (!samples) return out;
  for (const s of samples) {
    const threshold = s.large ? 3 : 4.5;
    if (s.ratio < threshold) {
      out.push({
        category: 'a11y',
        severity: 'warning',
        rule: 'a11y.contrast.low',
        message: `Contrast ratio ${s.ratio.toFixed(2)} is below ${threshold} on ${s.selector}.`,
        url: ctx.url,
        selector: s.selector,
        evidence: { ratio: s.ratio },
      });
    }
  }
  return out;
}
