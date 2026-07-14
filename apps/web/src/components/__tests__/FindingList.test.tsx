import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FindingList } from '../FindingList.js';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('../i18n/useDataTranslations', () => ({
  useDataTranslations: () => ({
    translated: new Map<string, string>(),
    loading: false,
    error: null,
  }),
}));

describe('FindingList', () => {
  it('renders a Suggest fix button per finding', () => {
    const findings = [
      { id: 'f1', category: 'seo', severity: 'warning', message: 'm', url: 'https://e.com' },
    ];
    render(
      <MemoryRouter>
        <FindingList findings={findings as any} />
      </MemoryRouter>,
    );
    expect(screen.getAllByText(/sugerir/i).length).toBeGreaterThan(0);
  });

  it('renders evidence keys/values when present', () => {
    const findings = [
      {
        id: 'f1',
        category: 'seo',
        severity: 'warning',
        message: 'm',
        url: 'https://e.com',
        evidence: { actualH1: 'Welcome', expectedH1: 'About' },
      },
    ];
    const { container } = render(
      <MemoryRouter>
        <FindingList findings={findings as any} />
      </MemoryRouter>,
    );
    expect(container.querySelector('.finding__evidence')).toBeTruthy();
    expect(screen.getByText('actualH1')).toBeTruthy();
    expect(screen.getByText('Welcome')).toBeTruthy();
  });

  it('does not render an evidence region when evidence is empty', () => {
    const findings = [
      {
        id: 'f1',
        category: 'seo',
        severity: 'info',
        message: 'm',
        url: 'https://e.com',
        evidence: {},
      },
    ];
    const { container } = render(
      <MemoryRouter>
        <FindingList findings={findings as any} />
      </MemoryRouter>,
    );
    expect(container.querySelector('.finding__evidence')).toBeFalsy();
  });
});
