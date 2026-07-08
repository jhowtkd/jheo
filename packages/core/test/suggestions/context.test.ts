import { describe, it, expect } from 'vitest';
import { buildSuggestionContext, type SuggestionContextInput } from '../../src/suggestions/context.js';

const baseInput: SuggestionContextInput = {
  finding: {
    id: 'f1',
    category: 'seo',
    severity: 'warning',
    message: 'Meta description is missing',
    url: 'https://example.com/page',
  },
  page: {
    id: 'p1',
    url: 'https://example.com/page',
    htmlSnapshot: '<!doctype html><html><head><title>Old</title></head><body><h1>Hi</h1><p>x</p></body></html>',
  },
  locale: 'pt-BR',
};

describe('buildSuggestionContext', () => {
  it('builds a context for seo with <head> slice', () => {
    const out = buildSuggestionContext(baseInput);
    expect(out.category).toBe('seo');
    expect(out.severity).toBe('warning');
    expect(out.findingMessage).toBe('Meta description is missing');
    expect(out.pageUrl).toBe('https://example.com/page');
    expect(out.htmlSlice).toContain('<head>');
    expect(out.locale).toBe('pt-BR');
  });

  it('throws CATEGORY_NOT_SUPPORTED for overall', () => {
    expect(() => buildSuggestionContext({ ...baseInput, finding: { ...baseInput.finding, category: 'overall' } }))
      .toThrowError('CATEGORY_NOT_SUPPORTED');
  });

  it('includes gsc summary when provided (geo)', () => {
    const out = buildSuggestionContext({
      ...baseInput,
      finding: { ...baseInput.finding, category: 'geo' },
      gsc: { impressions: 1000, ctr: 0.02, position: 12.5 },
    });
    expect(out.gsc).toEqual({ impressions: 1000, ctr: 0.02, position: 12.5 });
  });

  it('omits gsc when not provided', () => {
    const out = buildSuggestionContext(baseInput);
    expect(out.gsc).toBeUndefined();
  });

  it('truncates htmlSlice to <= 8192 chars (content category with huge body)', () => {
    const huge = '<!doctype html><html><head><title>t</title></head><body>' + 'a'.repeat(50_000) + '</body></html>';
    const out = buildSuggestionContext({
      ...baseInput,
      finding: { ...baseInput.finding, category: 'content' },
      page: { ...baseInput.page, htmlSnapshot: huge },
    });
    expect(out.htmlSlice.length).toBeLessThanOrEqual(8192);
  });

  it('geo category extracts JSON-LD blocks when present', () => {
    const html = '<!doctype html><html><head><title>t</title><script type="application/ld+json">{"@context":"https://schema.org"}</script></head><body></body></html>';
    const out = buildSuggestionContext({
      ...baseInput,
      finding: { ...baseInput.finding, category: 'geo' },
      page: { ...baseInput.page, htmlSnapshot: html },
    });
    expect(out.htmlSlice).toContain('application/ld+json');
  });
});
