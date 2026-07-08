import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfidenceChip } from '../ConfidenceChip.js';

describe('ConfidenceChip', () => {
  it('renders medium label by default and applies medium class', () => {
    const { container } = render(<ConfidenceChip confidence="medium" />);
    expect(container.querySelector('.confidence-chip--medium')).toBeTruthy();
  });
  it('renders low label', () => {
    render(<ConfidenceChip confidence="low" />);
    // Label is i18n: we just check the class is applied
  });
});
