import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { createQueryClientWrapper } from '../../../test/queryClientWrapper';
import { AuditsList } from '../AuditsList.js';

vi.mock('../../api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api.js')>();
  return {
    ...actual,
    listAudits: vi.fn(async () => []),
  };
});

function renderWith(node: ReactNode) {
  const QueryWrapper = createQueryClientWrapper();
  return render(<MemoryRouter><QueryWrapper>{node}</QueryWrapper></MemoryRouter>);
}

describe('AuditsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when no audits', async () => {
    const { listAudits } = await import('../../api.js');
    (listAudits as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    renderWith(<AuditsList />);

    // pt-BR default from setup: "Nenhuma auditoria ainda"
    await waitFor(() => {
      expect(screen.getByText(/Nenhuma auditoria ainda/i)).toBeInTheDocument();
    });
  });

  it('renders a row for each audit with project name and score', async () => {
    const { listAudits } = await import('../../api.js');
    (listAudits as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: 'a1',
        projectId: 'p1',
        projectName: 'Acme',
        status: 'completed',
        score: { overall: 82, byCategory: {} },
        startedAt: '2026-07-12T10:00:00Z',
        finishedAt: '2026-07-12T10:01:00Z',
        createdAt: '2026-07-12T10:00:00Z',
      },
    ]);

    renderWith(<AuditsList />);

    await waitFor(() => {
      expect(screen.getByText('Acme')).toBeInTheDocument();
      expect(screen.getByText('82')).toBeInTheDocument();
    });
  });
});
