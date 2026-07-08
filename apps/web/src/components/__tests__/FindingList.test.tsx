import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FindingList } from '../FindingList.js';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

// Stub the data-translation hook so the test does not hit `/api/translate`
// when the active locale differs from the source locale. The component
// falls back to the raw `finding.message` when the translated map is empty,
// which is fine for verifying the Suggest-fix button is rendered.
vi.mock('../i18n/useDataTranslations', () => ({
  useDataTranslations: () => ({ translated: new Map<string, string>(), loading: false, error: null }),
}));

describe('FindingList', () => {
  it('renders a Suggest fix button per finding', () => {
    const findings = [{ id: 'f1', category: 'seo', severity: 'warning', message: 'm', url: 'https://e.com' }];
    render(<MemoryRouter><FindingList findings={findings as any} /></MemoryRouter>);
    expect(screen.getAllByText(/gerar/i).length).toBeGreaterThan(0);
  });
});