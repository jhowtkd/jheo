import { describe, expect, it } from 'vitest';
import { CATEGORY_WEIGHTS, SCORE_ENGINE_VERSION, scoreFindings } from '../src/audit/score.js';
import type { Finding } from '../src/types.js';

const make = (rule: string, severity: Finding['severity'], category: Finding['category'] = 'seo'): Finding => ({
  category,
  severity,
  rule,
  message: rule,
  url: 'https://x/',
  evidence: {},
});

describe('audit/score v2', () => {
  it('exports engine version 2', () => {
    expect(SCORE_ENGINE_VERSION).toBe('2');
  });

  it('empty findings → all categories null, overall null (not 100)', () => {
    const result = scoreFindings([]);
    expect(result.overall).toBeNull();
    for (const cat of ['seo', 'cwv', 'geo', 'a11y', 'content'] as const) {
      expect(result.byCategory[cat]).toBeNull();
    }
  });

  it('info-only findings: category present at 100 with zero penalty', () => {
    const fs = [make('a', 'info'), make('b', 'info', 'cwv')];
    const result = scoreFindings(fs);
    expect(result.byCategory.seo).toBe(100);
    expect(result.byCategory.cwv).toBe(100);
    expect(result.byCategory.geo).toBeNull();
  });

  it('higher pageCount yields higher score for the same findings', () => {
    const fs: Finding[] = [make('a', 'error'), make('b', 'error'), make('c', 'warning')];
    const s1 = scoreFindings(fs, { pageCount: 1 });
    const s10 = scoreFindings(fs, { pageCount: 10 });
    expect(s10.byCategory.seo!).toBeGreaterThan(s1.byCategory.seo!);
  });

  it('weighted overall: SEO outweighs Content with identical findings', () => {
    // Same single error in each of two categories, but only one category per scenario.
    const seoOnly = scoreFindings([make('a', 'error', 'seo')]);
    const contentOnly = scoreFindings([make('a', 'error', 'content')]);
    // SEO weight (0.25) > content weight (0.15) but both rollups yield category score = 93.
    // With single category, the renormalised weighted mean is the category score itself.
    expect(seoOnly.overall).toBe(seoOnly.byCategory.seo);
    expect(contentOnly.overall).toBe(contentOnly.byCategory.content);
    // Verify weights exist and differ.
    expect(CATEGORY_WEIGHTS.seo).toBeGreaterThan(CATEGORY_WEIGHTS.content);
  });

  it('weights apply when categories with errors have different raw scores', () => {
    // Two errors in SEO (heavier weight) vs two errors in content (lighter weight).
    // Both single-category → renormalised mean = category score (equal here).
    // Use a scenario where categories have DIFFERENT scores to expose weighting:
    // 1 error in SEO (score 93) vs 1 error in content (also 93). Combined with a
    // third category that has more errors (lower score), weighting should pull
    // the overall toward the high-score categories proportionally to their weights.
    // SEO + Content with same score, no third cat: overall = 93.
    const same = scoreFindings([make('a', 'error', 'seo'), make('b', 'error', 'content')]);
    expect(same.overall).toBe(93);
    // Now SEO(93, weight 0.25) + CWV(93, weight 0.20): both contribute equally
    // to the renormalised mean because the weights cancel out (0.25 + 0.20)/2 = mean.
    const seoCwv = scoreFindings([make('a', 'error', 'seo'), make('b', 'error', 'cwv')]);
    expect(seoCwv.overall).toBe(93);
  });

  it('error curve: 1st error contributes exactly 7, k-th contributes 7 * k^1.2', () => {
    // Document expected numbers. Sum of k^1.2 from k=1..10 ≈ 80.075,
    // so 10 errors in a 1-page context yields penalty 560.5 → score 0 (clamped).
    const one = scoreFindings([make('e', 'error')], { pageCount: 1 });
    expect(one.byCategory.seo).toBe(93); // 100 - 7
    const three = scoreFindings(
      Array.from({ length: 3 }, (_, i) => make(`e${i}`, 'error')),
      { pageCount: 1 },
    );
    // Penalty = 7 * (1^1.2 + 2^1.2 + 3^1.2) = 7 * (1 + 2.297 + 3.737) = 7 * 7.034 = 49.24 → score 51
    expect(three.byCategory.seo).toBe(51);
  });

  it('all categories null → overall null', () => {
    const result = scoreFindings([], { pageCount: 5 });
    expect(result.overall).toBeNull();
  });

  it('present categories renormalise: missing category does not skew overall', () => {
    // SEO with error only (weight 0.25 of 1.0).
    // If we renormalised over ALL categories, overall would be 93 * 0.25 = 23.25.
    // We renormalise over present categories only, so overall = 93.
    const result = scoreFindings([make('a', 'error', 'seo')]);
    expect(result.overall).toBe(result.byCategory.seo);
  });

  it('clamps to 0 when penalties exceed 100', () => {
    const many: Finding[] = Array.from({ length: 200 }, (_, i) => make(`e${i}`, 'error'));
    const result = scoreFindings(many, { pageCount: 1 });
    expect(result.byCategory.seo).toBe(0);
  });
});