import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { registerLocaleHook } from '../src/i18n/hook.js';

const mockLoadOrGenerate = vi.fn();

vi.mock('../src/services/executive-report.js', () => ({
  loadOrGenerateExecutiveReport: mockLoadOrGenerate,
  ExecutiveReportNotFoundError: class ExecutiveReportNotFoundError extends Error {
    constructor() {
      super('AUDIT_NOT_FOUND');
      this.name = 'ExecutiveReportNotFoundError';
    }
  },
  ExecutiveReportNotCompletedError: class ExecutiveReportNotCompletedError extends Error {
    constructor(public readonly status: string) {
      super('AUDIT_NOT_COMPLETED');
      this.name = 'ExecutiveReportNotCompletedError';
    }
  },
}));

const {
  ExecutiveReportNotFoundError,
  ExecutiveReportNotCompletedError,
} = await import('../src/services/executive-report.js');
const { executiveReportRoutes } = await import('../src/routes/executive-report.js');

let app: FastifyInstance;

const fakePrisma = {
  audit: { update: vi.fn().mockResolvedValue({}) },
};

function readyRecord(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ready' as const,
    locale: 'en' as const,
    generatedAt: '2026-01-01T00:00:00.000Z',
    model: 'gpt-4o-mini',
    errorMessage: null,
    aggregates: {
      projectName: 'Test',
      rootUrl: 'https://example.com',
      auditId: 'a1',
      finishedAt: null,
      overall: 70,
      byCategory: { seo: 60 },
      pagesAudited: 3,
      pagesTotal: 4,
      pagesFailed: 1,
      severityCounts: { error: 1, warning: 2, info: 0 },
      topRules: [],
    },
    narrative: {
      executiveSummary: 'This is a summary of the audit results for your project.',
      topIssues: [],
      scenarios: [],
      recommendations: [],
    },
    ...overrides,
  };
}

beforeAll(async () => {
  app = Fastify();
  registerLocaleHook(app);
  await app.register(executiveReportRoutes, {
    prisma: fakePrisma as never,
    llmProviders: { openai: {} as never, anthropic: {} as never, openrouter: {} as never },
    fetchFn: globalThis.fetch,
  });
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe('GET /api/audits/:id/executive-report', () => {
  it('returns 200 for ready record', async () => {
    mockLoadOrGenerate.mockResolvedValueOnce(readyRecord());
    const res = await app.inject({ method: 'GET', url: '/api/audits/a1/executive-report' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ready');
  });

  it('returns 202 for generating record', async () => {
    mockLoadOrGenerate.mockResolvedValueOnce(
      readyRecord({ status: 'generating', narrative: null, generatedAt: null, model: null }),
    );
    const res = await app.inject({ method: 'GET', url: '/api/audits/a1/executive-report' });
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe('generating');
  });

  it('returns 200 for failed record with errorMessage', async () => {
    mockLoadOrGenerate.mockResolvedValueOnce(
      readyRecord({ status: 'failed', narrative: null, errorMessage: 'LLM timeout' }),
    );
    const res = await app.inject({ method: 'GET', url: '/api/audits/a1/executive-report' });
    expect(res.statusCode).toBe(200);
    expect(res.json().errorMessage).toBe('LLM timeout');
  });

  it('returns 404 when audit not found', async () => {
    mockLoadOrGenerate.mockRejectedValueOnce(new ExecutiveReportNotFoundError());
    const res = await app.inject({ method: 'GET', url: '/api/audits/missing/executive-report' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('AUDIT_NOT_FOUND');
  });

  it('returns 409 when audit not completed', async () => {
    mockLoadOrGenerate.mockRejectedValueOnce(
      new ExecutiveReportNotCompletedError('running'),
    );
    const res = await app.inject({ method: 'GET', url: '/api/audits/a1/executive-report' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('AUDIT_NOT_COMPLETED');
  });

  it('passes locale from Accept-Language header', async () => {
    mockLoadOrGenerate.mockResolvedValueOnce(readyRecord({ locale: 'pt-BR' }));
    await app.inject({
      method: 'GET',
      url: '/api/audits/a1/executive-report',
      headers: { 'accept-language': 'pt-BR' },
    });
    expect(mockLoadOrGenerate).toHaveBeenLastCalledWith(expect.anything(), 'a1', 'pt-BR');
  });

  it('invalidates cache on force=1', async () => {
    fakePrisma.audit.update.mockClear();
    mockLoadOrGenerate.mockResolvedValueOnce(readyRecord());
    await app.inject({
      method: 'GET',
      url: '/api/audits/a1/executive-report?force=1',
    });
    expect(fakePrisma.audit.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { executiveReport: Prisma.JsonNull },
    });
  });
});

describe('GET /api/audits/:id/executive-report/export', () => {
  it('returns 200 text/html for ready record', async () => {
    mockLoadOrGenerate.mockResolvedValueOnce(readyRecord());
    const res = await app.inject({ method: 'GET', url: '/api/audits/a1/executive-report/export' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('<h1>');
    expect(res.body).toContain('Executive Audit Report');
  });

  it('returns 409 when report is generating', async () => {
    mockLoadOrGenerate.mockResolvedValueOnce(
      readyRecord({ status: 'generating', narrative: null }),
    );
    const res = await app.inject({ method: 'GET', url: '/api/audits/a1/executive-report/export' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('REPORT_NOT_READY');
  });

  it('returns 409 when report is failed', async () => {
    mockLoadOrGenerate.mockResolvedValueOnce(
      readyRecord({ status: 'failed', narrative: null }),
    );
    const res = await app.inject({ method: 'GET', url: '/api/audits/a1/executive-report/export' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('REPORT_NOT_READY');
  });

  it('returns 404 when audit not found', async () => {
    mockLoadOrGenerate.mockRejectedValueOnce(new ExecutiveReportNotFoundError());
    const res = await app.inject({ method: 'GET', url: '/api/audits/missing/executive-report/export' });
    expect(res.statusCode).toBe(404);
  });

  it('escapes HTML in narrative', async () => {
    mockLoadOrGenerate.mockResolvedValueOnce(
      readyRecord({
        narrative: {
          executiveSummary: '<script>alert(1)</script>',
          topIssues: [],
          scenarios: [],
          recommendations: [],
        },
      }),
    );
    const res = await app.inject({ method: 'GET', url: '/api/audits/a1/executive-report/export' });
    expect(res.body).not.toContain('<script>');
    expect(res.body).toContain('&lt;script&gt;');
  });
});
