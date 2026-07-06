import type { AuditContext, Finding } from '../../types.js';

export const ThinContentKey = Symbol('thin-content');

export interface ThinContentConfig {
  minWords: number; // default 300
  keyPages?: string[]; // empty by default = applies to all
}

export async function checkThinContent(
  ctx: AuditContext,
  config: ThinContentConfig = { minWords: 300 },
): Promise<Finding[]> {
  const out: Finding[] = [];
  if (config.keyPages && config.keyPages.length > 0 && !config.keyPages.includes(ctx.url)) {
    return out;
  }
  const text = ctx.html.replace(/<[^>]+>/g, ' ').trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < config.minWords) {
    out.push({
      category: 'content',
      severity: 'warning',
      rule: 'content.thin',
      message: `Page has only ${words} words (threshold: ${config.minWords}).`,
      url: ctx.url,
      evidence: { words },
    });
  }
  return out;
}
