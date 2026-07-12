import { describe, it, expect } from 'vitest';
import { renderCategoryBarsSvg, renderSeverityDonutSvg } from '../../src/reports/charts.js';

describe('renderCategoryBarsSvg', () => {
  it('returns a valid standalone <svg> element', () => {
    const svg = renderCategoryBarsSvg({ seo: 90, cwv: 75 });
    expect(svg).toMatch(/^<svg[\s>]/);
    expect(svg.trim().endsWith('</svg>')).toBe(true);
  });

  it('has a width matching its viewBox', () => {
    const svg = renderCategoryBarsSvg({ seo: 90 });
    expect(svg).toContain('width="420"');
    expect(svg).toContain('viewBox="0 0 420');
  });

  it('renders category labels when provided', () => {
    const svg = renderCategoryBarsSvg(
      { seo: 90, cwv: 75 },
      { seo: 'SEO', cwv: 'Core Web Vitals' },
    );
    expect(svg).toContain('SEO');
    expect(svg).toContain('Core Web Vitals');
  });

  it('renders raw category keys as labels when no labels map given', () => {
    const svg = renderCategoryBarsSvg({ seo: 90, a11y: 70 });
    expect(svg).toContain('seo');
    expect(svg).toContain('a11y');
  });

  it('renders numeric scores in the output', () => {
    const svg = renderCategoryBarsSvg({ seo: 90, cwv: 75 });
    expect(svg).toContain('90');
    expect(svg).toContain('75');
  });

  it('renders "N/A" for null scores', () => {
    const svg = renderCategoryBarsSvg({ seo: 90, cwv: null });
    expect(svg).toContain('N/A');
  });

  it('renders a <rect> bar element for each non-null entry', () => {
    const svg = renderCategoryBarsSvg({ seo: 90, cwv: 75, a11y: 60 });
    const rectCount = (svg.match(/<rect/g) ?? []).length;
    expect(rectCount).toBeGreaterThanOrEqual(3);
  });
});

describe('renderSeverityDonutSvg', () => {
  it('returns a valid standalone <svg> element', () => {
    const svg = renderSeverityDonutSvg({ error: 5, warning: 3, info: 2 });
    expect(svg).toMatch(/^<svg[\s>]/);
    expect(svg.trim().endsWith('</svg>')).toBe(true);
  });

  it('contains <circle> elements for the donut segments', () => {
    const svg = renderSeverityDonutSvg({ error: 5, warning: 3, info: 2 });
    expect(svg).toContain('<circle');
  });

  it('uses stroke-dasharray for segments', () => {
    const svg = renderSeverityDonutSvg({ error: 5, warning: 3, info: 2 });
    expect(svg).toContain('stroke-dasharray');
  });

  it('uses red for error, amber for warning, blue for info', () => {
    const svg = renderSeverityDonutSvg({ error: 5, warning: 3, info: 2 });
    expect(svg).toContain('#dc2626');
    expect(svg).toContain('#f59e0b');
    expect(svg).toContain('#3b82f6');
  });

  it('handles all-zero counts without crashing', () => {
    const svg = renderSeverityDonutSvg({ error: 0, warning: 0, info: 0 });
    expect(svg).toMatch(/^<svg[\s>]/);
    expect(svg.trim().endsWith('</svg>')).toBe(true);
  });

  it('renders a center text with total count', () => {
    const svg = renderSeverityDonutSvg({ error: 5, warning: 3, info: 2 });
    expect(svg).toContain('10');
  });
});
