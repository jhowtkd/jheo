import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FixesPage } from '../FixesPage.js';

vi.mock('../../api.js', () => ({
  createSuggestion: vi.fn(),
  listSuggestions: vi.fn(async () => []),
  listSuggestionsByAudit: vi.fn(async () => []),
  acceptSuggestion: vi.fn(),
  rejectSuggestion: vi.fn(),
  listProjects: vi.fn(async () => []),
  getProject: vi.fn(async () => ({ audits: [], pages: [] })),
}));

describe('FixesPage', () => {
  // FixesPage calls fetch('/api/audits/:id/findings') directly when auditId is
  // set. jsdom's built-in fetch can't parse relative URLs, so stub the
  // network call here.
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchSpy = vi.fn(async () => new Response('[]', { status: 200 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the empty state when there are no findings (auditId set)', async () => {
    render(
      <MemoryRouter initialEntries={['/fixes?auditId=audit-with-no-findings']}>
        <FixesPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/nenhum achado/i)).toBeTruthy();
    });
  });

  it('shows the project chooser when there are no projects', async () => {
    const { listProjects } = await import('../../api.js');
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    render(<MemoryRouter><FixesPage /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/você ainda não tem projetos/i)).toBeTruthy();
    });
  });

  it('lists projects as cards when projects exist', async () => {
    const { listProjects } = await import('../../api.js');
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'p1', name: 'Marketing Acme', rootUrl: 'https://acme.com/', maxPages: 0, createdAt: '2026-01-01' },
      { id: 'p2', name: 'Cenbrap', rootUrl: 'https://cenbrap.edu.br/', maxPages: 0, createdAt: '2026-01-01' },
    ]);
    render(<MemoryRouter><FixesPage /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Marketing Acme')).toBeTruthy();
      expect(screen.getByText('Cenbrap')).toBeTruthy();
    });
  });
});