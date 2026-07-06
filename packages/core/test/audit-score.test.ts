import { describe, expect, it } from 'vitest';
import { scoreFindings } from '../src/audit/score.js';
import type { Finding } from '../src/types.js';

const make = (rule: string, severity: Finding['severity']): Finding => ({
  category: 'seo',
  severity,
  rule,
  message: rule,
  url: 'https://x/',
  evidence: {},
});

describe('audit/score', () => {
  it('returns null for empty input', () => {
    const result = scoreFindings([]);
    expect(result.overall).toBe(100);
    // Empty input → all categories are null (no findings to score).
    for (const cat of ['seo', 'cwv', 'geo', 'a11y', 'content'] as const) {
      expect(result.byCategory[cat]).toBeNull();
    }
  });
  it('penalises by severity, weighted equally across categories', () => {
    const fs: Finding[] = [make('a', 'error'), make('b', 'warning'), make('c', 'info')];
    const result = scoreFindings(fs);
    expect(result.overall).toBeLessThan(100);
    expect(result.byCategory.seo).toBeGreaterThan(0);
  });
});