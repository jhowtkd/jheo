import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiffView } from '../DiffView.js';

describe('DiffView', () => {
  it('renders inline by default', () => {
    render(<DiffView before="a" after="b" />);
    expect(screen.getByText(/a/)).toBeTruthy();
    expect(screen.getByText(/b/)).toBeTruthy();
  });

  it('renders side-by-side when mode="sideBySide"', () => {
    const { container } = render(<DiffView before="a" after="b" mode="sideBySide" />);
    expect(container.querySelectorAll('.diffview__col').length).toBe(2);
  });
});
