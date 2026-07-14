import type { Category, Finding } from '../types.js';

export const SCORE_ENGINE_VERSION = '2';

export const CATEGORY_WEIGHTS: Readonly<Record<Category, number>> = {
  seo: 0.25,
  cwv: 0.2,
  geo: 0.25,
  a11y: 0.15,
  content: 0.15,
};

const CATEGORIES: Category[] = ['seo', 'cwv', 'geo', 'a11y', 'content'];

// Per-category constants. Warning is flat; error grows sub-linearly via
// a power curve so a single error does not dominate (the spec requires
// "non-linear error accumulation" so many errors degrade slower than
// `7 * n` after the first few). Info contributes zero penalty but
// still marks the category as "present" so it is included in the
// weighted overall.
const WARNING_PENALTY = 3;
const ERROR_BASE = 7;
const ERROR_EXPONENT = 1.2;

export interface ScoreBreakdown {
  overall: number | null;
  byCategory: Partial<Record<Category, number | null>>;
}

export interface ScoreOptions {
  pageCount?: number;
}

interface CategoryAccum {
  errors: number;
  warnings: number;
  hasInfo: boolean;
}

/**
 * Score findings for a single page (pageCount=1) or roll up across many
 * pages (pageCount > 1) by dividing raw penalties by `pageCount`. The
 * curve ensures a single error costs more per-error than the n-th one,
 * so adding more errors on the same page still hurts but flattens.
 */
export function scoreFindings(findings: Finding[], opts: ScoreOptions = {}): ScoreBreakdown {
  const pageCount = Math.max(1, Math.floor(opts.pageCount ?? 1));

  const accums: Partial<Record<Category, CategoryAccum>> = {};
  for (const f of findings) {
    const entry = accums[f.category] ?? { errors: 0, warnings: 0, hasInfo: false };
    if (f.severity === 'error') entry.errors += 1;
    else if (f.severity === 'warning') entry.warnings += 1;
    else entry.hasInfo = true;
    accums[f.category] = entry;
  }

  const byCategory: Partial<Record<Category, number | null>> = {};
  let weightSum = 0;
  let weightedSum = 0;

  for (const cat of CATEGORIES) {
    const acc = accums[cat];
    const present = acc !== undefined && acc.errors + acc.warnings + (acc.hasInfo ? 1 : 0) > 0;
    if (!present) {
      byCategory[cat] = null;
      continue;
    }
    const errors = acc.errors;
    let raw = 0;
    for (let k = 1; k <= errors; k++) raw += ERROR_BASE * Math.pow(k, ERROR_EXPONENT);
    raw += acc.warnings * WARNING_PENALTY;
    const penalty = raw / pageCount;
    const score = Math.max(0, Math.round(100 - penalty));
    byCategory[cat] = score;
    weightSum += CATEGORY_WEIGHTS[cat];
    weightedSum += score * CATEGORY_WEIGHTS[cat];
  }

  const overall = weightSum === 0 ? null : Math.round(weightedSum / weightSum);
  return { overall, byCategory };
}
