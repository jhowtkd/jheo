import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreCard } from '../src/components/ScoreCard.js';

describe('ScoreCard', () => {
  it('renders the rounded value', () => {
    render(<ScoreCard label="Overall" value={73.4} />);
    expect(screen.getByText('73')).toBeTruthy();
  });
  it('renders dash for null', () => {
    render(<ScoreCard label="cwv" value={null} />);
    expect(screen.getByText('—')).toBeTruthy();
  });
});
