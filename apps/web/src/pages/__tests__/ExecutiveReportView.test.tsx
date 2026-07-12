import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { createQueryClientWrapper } from '../../../test/queryClientWrapper';
import { ExecutiveReportView } from '../ExecutiveReportView.js';
import type { ExecutiveReportResponse } from '../../api.js';

vi.mock('../../api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api.js')>();
  return {
    ...actual,
    getExecutiveReport: vi.fn(),
  };
});

function renderWith(node: ReactNode) {
  const QueryWrapper = createQueryClientWrapper();
  return render(
    <MemoryRouter>
      <QueryWrapper>{node}</QueryWrapper>
    </MemoryRouter>,
  );
}

const READY_PAYLOAD: ExecutiveReportResponse = {
  status: 'ready',
  locale: 'pt-BR',
  generatedAt: '2026-07-10T10:00:00.000Z',
  model: 'gpt-4o',
  errorMessage: null,
  aggregates: {
    projectName: 'Cenbrap',
    rootUrl: 'https://cenbrap.edu.br/',
    auditId: 'a1',
    finishedAt: '2026-07-10T10:00:00.000Z',
    overall: 72,
    byCategory: { seo: 80, cwv: 65, geo: 70, a11y: 90, content: 55 },
    pagesAudited: 996,
    pagesTotal: 1000,
    pagesFailed: 4,
    severityCounts: { error: 12, warning: 30, info: 8 },
    topRules: [],
    gsc: {
      clicks: 1200,
      impressions: 45000,
      ctr: 0.027,
      lowCtrQueryCount: 15,
      periodDays: 28,
    },
  },
  narrative: {
    executiveSummary:
      'O site apresenta boa saúde geral, mas há oportunidades importantes em conteúdo e performance.',
    topIssues: [
      {
        rule: 'img-alt',
        title: 'Imagens sem texto alternativo',
        businessImpact: 'Acessibilidade e SEO prejudicados',
        impactLevel: 'high',
        affectedPages: 120,
      },
    ],
    scenarios: [
      {
        label: 'Corrigir todas as imagens sem alt',
        estimatedScoreFrom: 72,
        estimatedScoreTo: 85,
        rationale: 'Adicionar alt text em 120 páginas aumentaria o score de acessibilidade.',
      },
    ],
    recommendations: [
      'Priorizar correções de acessibilidade nas páginas mais visitadas.',
      'Otimizar imagens para melhorar Core Web Vitals.',
    ],
  },
};

const GENERATING_PAYLOAD: ExecutiveReportResponse = {
  ...READY_PAYLOAD,
  status: 'generating',
  narrative: null,
  generatedAt: null,
  model: null,
};

describe('ExecutiveReportView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders executive summary and scenario labels when ready', async () => {
    const { getExecutiveReport } = await import('../../api.js');
    (getExecutiveReport as ReturnType<typeof vi.fn>).mockResolvedValueOnce(READY_PAYLOAD);

    renderWith(<ExecutiveReportView auditId="a1" />);

    await waitFor(() => {
      expect(screen.getByText(READY_PAYLOAD.narrative!.executiveSummary)).toBeTruthy();
    });
    expect(screen.getByText('Cenbrap')).toBeTruthy();
    expect(screen.getByText(/Cenários Hipotéticos/i)).toBeTruthy();
    expect(screen.getByText('Corrigir todas as imagens sem alt')).toBeTruthy();
    expect(screen.getByText('Imagens sem texto alternativo')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Exportar HTML/i })).toHaveAttribute(
      'href',
      '/api/audits/a1/executive-report/export',
    );
  });

  it('shows generating message while status is generating', async () => {
    const { getExecutiveReport } = await import('../../api.js');
    (getExecutiveReport as ReturnType<typeof vi.fn>).mockResolvedValueOnce(GENERATING_PAYLOAD);

    renderWith(<ExecutiveReportView auditId="a1" />);

    await waitFor(() => {
      expect(screen.getByText(/Gerando relatório executivo/i)).toBeTruthy();
    });
  });
});
