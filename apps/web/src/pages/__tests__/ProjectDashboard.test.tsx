import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';

// Keep humanError (real) + types from the actual module; stub the network
// calls the Dashboard fires on mount so the test only exercises the
// getProject error path — no real fetch in jsdom.
vi.mock('../../api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api.js')>();
  return {
    ...actual,
    getProject: vi.fn(),
    reAuditPage: vi.fn(),
    getPageAuditDetail: vi.fn(),
    getProjectHealth: vi.fn(async () => ({
      pagesTotal: 0,
      pagesAudited: 0,
      pagesWithError: 0,
      lastAuditAt: null,
    })),
    getProjectPages: vi.fn(async () => ({ items: [], total: 0, limit: 200, offset: 0 })),
    listMaterials: vi.fn(async () => []),
    listChannels: vi.fn(async () => []),
    listGenerations: vi.fn(async () => []),
  };
});

import {
  getProject,
  getProjectHealth,
  getProjectPages,
  getPageAuditDetail,
  reAuditPage,
} from '../../api.js';
import { ProjectDashboard } from '../ProjectDashboard.js';

function renderDashboard() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/projects/p1']}>
          <Routes>
            <Route path="/projects/:projectId" element={<ProjectDashboard />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('ProjectDashboard errors', () => {
  beforeEach(() => {
    vi.mocked(getProject).mockReset();
  });

  it('shows ErrorState (role=alert) instead of the raw sentinel when getProject rejects', async () => {
    vi.mocked(getProject).mockRejectedValue(new Error('backend_unavailable'));
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    // The raw sentinel must never reach the DOM.
    expect(screen.queryByText('backend_unavailable')).toBeNull();
  });
});

describe('ProjectDashboard re-audit retry', () => {
  beforeEach(() => {
    vi.mocked(getProject).mockReset();
    vi.mocked(reAuditPage).mockReset();
    vi.mocked(getProjectHealth).mockResolvedValue({
      overall: null,
      byCategory: { seo: null, cwv: null, geo: null, a11y: null, content: null },
      pagesTotal: 0,
      pagesAudited: 0,
      pagesWithError: 0,
      lastAuditAt: null,
    });
    // Runtime carries `audits` even though the Project type omits it.
    vi.mocked(getProject).mockResolvedValue({
      id: 'p1',
      name: 'Demo',
      rootUrl: 'https://demo.test',
      createdAt: '2024-01-01T00:00:00Z',
      audits: [],
    } as unknown as Awaited<ReturnType<typeof getProject>>);
    vi.mocked(getProjectPages).mockResolvedValue({
      total: 1,
      limit: 200,
      offset: 0,
      items: [{ id: 'pg1', url: 'https://demo.test/', discoveredVia: 'root', lastAuditedAt: null }],
    });
    // The retry's onSuccess opens the diff modal → detail query fires. Resolve it
    // cleanly so React Query doesn't warn about undefined data.
    vi.mocked(getPageAuditDetail).mockResolvedValue({
      id: 'pa1',
      projectPageId: 'pg1',
      url: 'https://demo.test/',
      status: 'completed',
      score: null,
      startedAt: null,
      finishedAt: null,
      errorMessage: null,
      findings: [],
      fixed: [],
    });
  });

  it('re-invokes reAuditPage when the error banner retry is clicked (honest retry)', async () => {
    // First re-audit rejects (banner shows), second resolves (retry succeeds).
    vi.mocked(reAuditPage)
      .mockRejectedValueOnce(new Error('Re-audit failed: 500'))
      .mockResolvedValueOnce({ pageAuditId: 'pa1' });

    renderDashboard();

    // Trigger the failure via the per-row re-audit button (pt-BR: "Reauditar").
    const reAuditBtn = await screen.findByRole('button', { name: 'Reauditar' });
    fireEvent.click(reAuditBtn);

    // The page-level error banner renders (role=alert) with a retry button
    // (pt-BR: "Tentar novamente").
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    const retryBtn = await screen.findByRole('button', { name: 'Tentar novamente' });

    // Clicking it must actually re-attempt the audit — not just dismiss.
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(reAuditPage).toHaveBeenCalledTimes(2);
    });
    expect(reAuditPage).toHaveBeenNthCalledWith(1, 'pg1');
    expect(reAuditPage).toHaveBeenNthCalledWith(2, 'pg1');
  });
});
