import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ensureI18n, i18n } from '../src/i18n';
import { ScoreCard } from '../src/components/ScoreCard.js';
import type { ProjectHealth } from '../src/api.js';

beforeEach(async () => {
  window.localStorage.removeItem('jheo.locale');
  await ensureI18n();
  i18n.changeLanguage('en');
});

const baseHealth: ProjectHealth = {
  overall: 80,
  byCategory: { seo: 90, cwv: 80, geo: 70, a11y: 85, content: 75 },
  pagesAudited: 1,
  pagesTotal: 1,
  pagesWithError: 0,
  lastAuditAt: null,
};

describe('ScoreCard', () => {
  it('renders the rounded overall value', () => {
    const { container } = render(<ScoreCard health={baseHealth} />);
    // The overall is rendered inside .scorecard__overall; other category rows
    // show their number too but not inside that class. This disambiguates
    // without depending on text regex priority.
    const overall = container.querySelector('.scorecard__overall');
    expect(overall?.textContent).toBe('80');
  });

  it('renders fallback when health is null', () => {
    render(<ScoreCard health={null} />);
    expect(screen.getByText(/no health data/i)).toBeTruthy();
  });

  it('shows an up badge when current > previous', () => {
    render(<ScoreCard health={baseHealth} previousOverall={70} />);
    expect(screen.getByText(/↑\s*10/)).toBeTruthy();
  });

  it('shows a down badge when current < previous', () => {
    render(<ScoreCard health={baseHealth} previousOverall={90} />);
    expect(screen.getByText(/↓\s*10/)).toBeTruthy();
  });

  it('shows an equals badge when delta is zero', () => {
    render(<ScoreCard health={baseHealth} previousOverall={80} />);
    expect(screen.getByText(/=\s*0/)).toBeTruthy();
  });

  it('renders a sparkline when history has ≥ 2 points', () => {
    const { container } = render(
      <ScoreCard health={baseHealth} history={[60, 70, 80]} />,
    );
    expect(container.querySelector('svg polyline')).toBeTruthy();
  });

  it('does not render a sparkline when history has < 2 points', () => {
    const { container } = render(
      <ScoreCard health={baseHealth} history={[80]} />,
    );
    expect(container.querySelector('svg polyline')).toBeFalsy();
  });

  it('shows the recomputed chip when flagged', () => {
    render(<ScoreCard health={baseHealth} recomputed />);
    expect(screen.getByText(/recomputed/i)).toBeTruthy();
  });

  it('uses translated category labels and tooltips', () => {
    const { container } = render(<ScoreCard health={baseHealth} />);
    // SEO is the first category — its translated label is in the DOM.
    expect(screen.getByText(/^SEO$/i)).toBeTruthy();
    // The label span carries the tooltip via title attribute.
    const seoLabel = container.querySelector('[title^="Search engine"]');
    expect(seoLabel).toBeTruthy();
  });
});