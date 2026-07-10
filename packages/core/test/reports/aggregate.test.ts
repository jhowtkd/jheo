import { describe, it, expect } from 'vitest';
import { buildAuditSummary } from '../../src/reports/aggregate.js';

const baseFinding = {
  category: 'seo' as const,
  severity: 'warning' as const,
  message: 'Meta description is missing',
  url: 'https://example.com/a',
  selector: null,
  evidence: {},
};

describe('buildAuditSummary', () => {
  it('tallies severity counts and groups top rules by distinct url', () => {
    const summary = buildAuditSummary({
      projectName: 'Acme',
      rootUrl: 'https://example.com/',
      auditId: 'a1',
      finishedAt: '2026-07-10T10:00:00.000Z',
      score: {
        overall: 88,
        byCategory: { seo: 90, cwv: null, geo: 85, a11y: 80, content: 88 },
        pagesAudited: 10,
        pagesTotal: 12,
      },
      pagesFailed: 2,
      findings: [
        { ...baseFinding, rule: 'meta.missing-description', url: 'https://example.com/1' },
        { ...baseFinding, rule: 'meta.missing-description', url: 'https://example.com/2' },
        { ...baseFinding, rule: 'meta.missing-description', url: 'https://example.com/1' },
        { ...baseFinding, rule: 'images.missing-alt', severity: 'error', url: 'https://example.com/3' },
      ],
    });
    expect(summary.severityCounts).toEqual({ error: 1, warning: 2, info: 0 });
    expect(summary.topRules[0]?.rule).toBe('meta.missing-description');
    expect(summary.topRules[0]?.affectedPages).toBe(2);
    expect(summary.overall).toBe(88);
  });

  it('includes optional gsc slice when provided', () => {
    const summary = buildAuditSummary({
      projectName: 'Acme',
      rootUrl: 'https://example.com/',
      auditId: 'a1',
      finishedAt: null,
      score: { overall: 70, byCategory: {}, pagesAudited: 5, pagesTotal: 5 },
      pagesFailed: 0,
      findings: [],
      gsc: { clicks: 4200, impressions: 100000, ctr: 0.042, lowCtrQueryCount: 18, periodDays: 28 },
    });
    expect(summary.gsc?.clicks).toBe(4200);
  });
});
