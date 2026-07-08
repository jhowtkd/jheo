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

describe('ScoreCard', () => {
  it('renders the rounded overall value', () => {
    const health: ProjectHealth = {
      overall: 73.4,
      byCategory: { seo: 100, cwv: 100, geo: 100, a11y: 100, content: 100 },
      pagesAudited: 1,
      pagesTotal: 1,
      pagesWithError: 0,
      lastAuditAt: null,
    };
    render(<ScoreCard health={health} />);
    expect(screen.getByText(/^73/)).toBeTruthy();
  });

  it('renders fallback when health is null', () => {
    render(<ScoreCard health={null} />);
    expect(screen.getByText(/no health data/i)).toBeTruthy();
  });
});