import { describe, it, expect } from 'vitest';
import { renderExecutiveReportHtml } from '../src/services/executive-report-html.js';
import type { ExecutiveReportRecord } from '@jheo/core';

function makeRecord(overrides: Partial<ExecutiveReportRecord> = {}): ExecutiveReportRecord {
  return {
    status: 'ready',
    locale: 'en',
    generatedAt: '2026-07-10T12:00:00.000Z',
    model: 'gpt-4o-mini',
    errorMessage: null,
    aggregates: {
      projectName: 'Acme Corp',
      rootUrl: 'https://acme.example.com',
      auditId: 'audit-123',
      finishedAt: '2026-07-10T11:00:00.000Z',
      overall: 72,
      byCategory: { seo: 80, cwv: 65, a11y: 40, geo: null, content: 90 },
      pagesAudited: 10,
      pagesTotal: 12,
      pagesFailed: 2,
      severityCounts: { error: 5, warning: 12, info: 3 },
      topRules: [],
    },
    narrative: {
      executiveSummary: 'Your site shows solid SEO foundations but needs accessibility improvements.',
      topIssues: [
        {
          rule: 'img-alt',
          title: 'Missing image alt text',
          businessImpact: 'Reduces accessibility and image search traffic',
          impactLevel: 'high',
          affectedPages: 8,
        },
        {
          rule: 'title-len',
          title: 'Title tags too short',
          businessImpact: 'Missed keyword targeting opportunities',
          impactLevel: 'medium',
          affectedPages: 4,
        },
      ],
      scenarios: [
        {
          label: 'Fix all alt text',
          estimatedScoreFrom: 72,
          estimatedScoreTo: 82,
          rationale: 'Addressing accessibility gaps lifts the overall score notably.',
        },
      ],
      recommendations: [
        'Add descriptive alt attributes to all images',
        'Expand title tags to 50-60 characters',
      ],
    },
    ...overrides,
  };
}

describe('renderExecutiveReportHtml', () => {
  it('produces a full HTML document', () => {
    const html = renderExecutiveReportHtml(makeRecord());
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('</html>');
  });

  it('embeds SVG charts', () => {
    const html = renderExecutiveReportHtml(makeRecord());
    expect(html).toContain('<svg');
    expect(html.match(/<svg/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('includes the executive summary text', () => {
    const html = renderExecutiveReportHtml(makeRecord());
    expect(html).toContain('solid SEO foundations but needs accessibility improvements');
  });

  it('includes top issue titles', () => {
    const html = renderExecutiveReportHtml(makeRecord());
    expect(html).toContain('Missing image alt text');
    expect(html).toContain('Title tags too short');
  });

  it('includes recommendations', () => {
    const html = renderExecutiveReportHtml(makeRecord());
    expect(html).toContain('Add descriptive alt attributes to all images');
    expect(html).toContain('<ol>');
  });

  it('sets locale on the html tag', () => {
    const html = renderExecutiveReportHtml(makeRecord({ locale: 'pt-BR' }));
    expect(html).toContain('<html lang="pt-BR">');
  });

  it('renders pt-BR localized labels', () => {
    const html = renderExecutiveReportHtml(makeRecord({ locale: 'pt-BR' }));
    expect(html).toContain('Relat\u00f3rio Executivo');
  });

  it('escapes HTML in narrative content', () => {
    const html = renderExecutiveReportHtml(
      makeRecord({
        narrative: {
          executiveSummary: '<script>alert("xss")</script>',
          topIssues: [
            {
              rule: 'img-alt',
              title: '<img src=x onerror=alert(1)>',
              businessImpact: 'impact',
              impactLevel: 'high',
              affectedPages: 1,
            },
          ],
          scenarios: [],
          recommendations: ['<b>bold</b>'],
        },
      }),
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<img ');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;b&gt;');
  });

  it('renders GSC section when present', () => {
    const html = renderExecutiveReportHtml(
      makeRecord({
        aggregates: {
          ...makeRecord().aggregates,
          gsc: { clicks: 1500, impressions: 50000, ctr: 0.03, lowCtrQueryCount: 7, periodDays: 28 },
        },
      }),
    );
    expect(html).toContain('1,500');
    expect(html).toContain('50,000');
    expect(html).toContain('3.0%');
    expect(html).toContain('Search Console Performance');
  });

  it('omits GSC section when absent', () => {
    const html = renderExecutiveReportHtml(makeRecord());
    expect(html).not.toContain('Search Console Performance');
  });

  it('includes print media query', () => {
    const html = renderExecutiveReportHtml(makeRecord());
    expect(html).toContain('@media print');
  });

  it('includes footer with audit id', () => {
    const html = renderExecutiveReportHtml(makeRecord());
    expect(html).toContain('audit-123');
    expect(html).toContain('footer');
  });

  it('renders scenario score range', () => {
    const html = renderExecutiveReportHtml(makeRecord());
    expect(html).toContain('72–82');
  });

  it('renders overall score badge', () => {
    const html = renderExecutiveReportHtml(makeRecord());
    expect(html).toContain('score-badge');
    expect(html).toContain('>72<');
  });

  it('handles null narrative gracefully', () => {
    const html = renderExecutiveReportHtml(makeRecord({ narrative: null }));
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('not ready');
  });
});
