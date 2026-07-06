import type { Category, Finding } from '../types.js';

const WEIGHTS = { error: 7, warning: 3, info: 1 } as const;

const CATEGORIES: Category[] = ['seo', 'cwv', 'geo', 'a11y', 'content'];

export interface ScoreBreakdown {
  overall: number;
  byCategory: Partial<Record<Category, number | null>>;
}

export function scoreFindings(findings: Finding[]): ScoreBreakdown {
  const byCategory: Partial<Record<Category, number | null>> = {};
  for (const cat of CATEGORIES) {
    const items = findings.filter((f) => f.category === cat);
    if (items.length === 0) {
      byCategory[cat] = null;
      continue;
    }
    const penalty = items.reduce((acc, f) => acc + WEIGHTS[f.severity], 0);
    byCategory[cat] = Math.max(0, 100 - penalty);
  }
  const cats = CATEGORIES.map((c) => byCategory[c]).filter((v): v is number => v !== null);
  const overall = cats.length === 0 ? 100 : Math.round(cats.reduce((a, b) => a + b, 0) / cats.length);
  return { overall, byCategory };
}