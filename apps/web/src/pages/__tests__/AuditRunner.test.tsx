import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuditRunner } from '../AuditRunner.js';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';

vi.mock('../../api.js', async () => {
  const actual = await vi.importActual<typeof import('../../api.js')>('../../api.js');
  return { ...actual, runAudit: vi.fn() };
});

import { runAudit } from '../../api.js';

function renderRunner() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/projects/p1/audit']}>
          <Routes>
            <Route path="/projects/:projectId/audit" element={<AuditRunner />} />
            {/* pt-BR audit results route — matches the localized navigate target */}
            <Route path="/auditorias/:auditId" element={<div data-testid="audit-results" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('AuditRunner errors', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('pt-BR');
    vi.mocked(runAudit).mockReset();
  });

  it('shows translated ErrorState instead of raw Error.message', async () => {
    vi.mocked(runAudit).mockRejectedValueOnce(new Error('backend_unavailable'));
    renderRunner();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/indisponível|unavailable|servidor/i);
    });
    expect(screen.queryByText('backend_unavailable')).toBeNull();
  });

  it('defaults to maxPages=50 and all sources on', () => {
    vi.mocked(runAudit).mockResolvedValueOnce({ id: 'a1', projectId: 'p1', status: 'queued', startedAt: null, finishedAt: null });
    renderRunner();
    // The maxPages input should default to 50.
    const maxPagesInput = screen.getByDisplayValue('50');
    expect(maxPagesInput).toBeInTheDocument();
    // All three source checkboxes checked by default.
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes).toHaveLength(3);
    expect(checkboxes.every((cb) => cb.checked)).toBe(true);
  });

  it('calls runAudit with config containing maxPages and sources', async () => {
    vi.mocked(runAudit).mockResolvedValueOnce({ id: 'a1', projectId: 'p1', status: 'queued', startedAt: null, finishedAt: null });
    renderRunner();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(runAudit).toHaveBeenCalledWith('p1', {
        maxPages: 50,
        sources: { root: true, sitemap: true, crawl: true },
      });
    });
  });
});
