import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

import { getProject } from '../../api.js';
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
