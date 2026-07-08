import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FixesPage } from '../FixesPage.js';

vi.mock('../../api.js', () => ({
  createSuggestion: vi.fn(),
  listSuggestions: vi.fn(async () => []),
  acceptSuggestion: vi.fn(),
  rejectSuggestion: vi.fn(),
}));

describe('FixesPage', () => {
  it('renders the empty state when there are no findings', async () => {
    render(<MemoryRouter><FixesPage /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/nenhum achado/i)).toBeTruthy();
    });
  });
});