import type { Category, Finding } from '../types.js';

const WEIGHTS = { error: 7, warning: 3, info: 1 } as const;

const CATEGORIES: Category[] = ['seo', 'cwv', 'geo', 'a11y', 'content'];

export interface ScoreBreakdown {
  overall: number;
  byCategory: Partial<Record<Category, number | null>>;
}

export function scoreFindings(findings: Finding[]): ScoreBreakdown {
  // Single-pass aggregation: one walk over findings produces both the
  // by-category penalty map AND a running count of populated categories.
  // The previous implementation did C×N + a final reduce — five passes
  // where one suffices.
  type Counts = Partial<Record<Category, { penalty: number; present: boolean }>>;
  const counts: Counts = {};
  for (const f of findings) {
    const entry = counts[f.category] ?? { penalty: 0, present: false };
    entry.penalty += WEIGHTS[f.severity];
    entry.present = true;
    counts[f.category] = entry;
  }

  const byCategory: Partial<Record<Category, number | null>> = {};
  let populatedTotal = 0;
  let populatedCount = 0;
  for (const cat of CATEGORIES) {
    const entry = counts[cat];
    if (!entry?.present) {
      byCategory[cat] = null;
      continue;
    }
    const score = Math.max(0, 100 - entry.penalty);
    byCategory[cat] = score;
    populatedTotal += score;
    populatedCount += 1;
  }
  const overall = populatedCount === 0 ? 100 : Math.round(populatedTotal / populatedCount);
  return { overall, byCategory };
}
