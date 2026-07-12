import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { createQueryClientWrapper } from '../../../test/queryClientWrapper';
import { ReportsList } from '../ReportsList.js';

vi.mock('../../api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api.js')>();
  return {
    ...actual,
    listProjects: vi.fn(async () => []),
    getProject: vi.fn(async () => ({ audits: [], pages: [] })),
  };
});

function renderWith(node: ReactNode, initial = '/reports') {
  const QueryWrapper = createQueryClientWrapper();
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <QueryWrapper>{node}</QueryWrapper>
    </MemoryRouter>,
  );
}

describe('ReportsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows empty state when there are no completed audits', async () => {
    const { listProjects } = await import('../../api.js');
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    renderWith(<ReportsList />);

    await waitFor(() => {
      expect(screen.getByText(/nenhum relatório concluído/i)).toBeTruthy();
    });
    expect(screen.getByRole('link', { name: /ir para projetos/i })).toHaveAttribute('href', '/projects');
  });

  it('lists completed audits with a link to the report page', async () => {
    const { listProjects, getProject } = await import('../../api.js');
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'p1', name: 'Cenbrap', rootUrl: 'https://cenbrap.edu.br/', createdAt: '2026-01-01' },
    ]);
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'p1',
      name: 'Cenbrap',
      rootUrl: 'https://cenbrap.edu.br/',
      createdAt: '2026-01-01',
      pages: [],
      audits: [
        {
          id: 'a1',
          projectId: 'p1',
          status: 'completed',
          startedAt: '2026-07-10T09:00:00.000Z',
          finishedAt: '2026-07-10T10:00:00.000Z',
          score: { overall: 88, byCategory: {}, pagesAudited: 996 },
        },
        {
          id: 'a2',
          projectId: 'p1',
          status: 'running',
          startedAt: '2026-07-10T11:00:00.000Z',
          finishedAt: null,
          score: null,
        },
      ],
    });

    renderWith(<ReportsList />);

    await waitFor(() => {
      expect(screen.getByText('Cenbrap')).toBeTruthy();
    });
    expect(screen.getByText('88')).toBeTruthy();
    expect(screen.getByRole('link', { name: /abrir relatório/i })).toHaveAttribute('href', '/audits/a1');
    expect(screen.queryByText(/running/i)).toBeNull();
  });

  it('filters by projectId query param', async () => {
    const { listProjects, getProject } = await import('../../api.js');
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'p1', name: 'Cenbrap', rootUrl: 'https://cenbrap.edu.br/', createdAt: '2026-01-01' },
      { id: 'p2', name: 'Acme', rootUrl: 'https://acme.com/', createdAt: '2026-01-01' },
    ]);
    (getProject as ReturnType<typeof vi.fn>).mockImplementation(async (id: string) => ({
      id,
      name: id === 'p1' ? 'Cenbrap' : 'Acme',
      rootUrl: id === 'p1' ? 'https://cenbrap.edu.br/' : 'https://acme.com/',
      createdAt: '2026-01-01',
      pages: [],
      audits: [
        {
          id: `audit-${id}`,
          projectId: id,
          status: 'completed',
          startedAt: '2026-07-10T09:00:00.000Z',
          finishedAt: '2026-07-10T10:00:00.000Z',
          score: { overall: 70, byCategory: {}, pagesAudited: 10 },
        },
      ],
    }));

    renderWith(<ReportsList />, '/reports?projectId=p1');

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /abrir relatório/i })).toHaveAttribute(
        'href',
        '/audits/audit-p1',
      );
    });
    expect(getProject).toHaveBeenCalledWith('p1');
    expect(getProject).not.toHaveBeenCalledWith('p2');
    expect(screen.queryByRole('link', { name: /abrir relatório/i, hidden: false })).toBeTruthy();
    expect(screen.queryByText('https://acme.com/')).toBeNull();
  });
});
