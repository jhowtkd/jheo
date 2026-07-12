import { describe, it, expect, vi } from 'vitest';
import {
  loadOrGenerateExecutiveReport,
  ExecutiveReportNotFoundError,
  ExecutiveReportNotCompletedError,
  type ExecutiveReportDeps,
} from '../src/services/executive-report.js';
import type { ExecutiveNarrative, LLMProvider } from '@jheo/core';

const VALID_NARRATIVE: ExecutiveNarrative = {
  executiveSummary: 'A'.repeat(60),
  topIssues: [
    { rule: 'img-alt', title: 'Missing alt text', businessImpact: 'A11y', impactLevel: 'high', affectedPages: 5 },
    { rule: 'bogus-rule', title: 'Hallucinated', businessImpact: 'X', impactLevel: 'low', affectedPages: 1 },
  ],
  scenarios: [
    { label: 'Fix alts', estimatedScoreFrom: 90, estimatedScoreTo: 95, rationale: 'because' },
  ],
  recommendations: ['Fix images'],
};

function fakeProvider(response: ExecutiveNarrative | Error): LLMProvider {
  return {
    complete: vi.fn(async () => {
      if (response instanceof Error) throw response;
      return {
        text: JSON.stringify(response),
        usage: { promptTokens: 10, completionTokens: 20 },
        provider: 'fake',
        model: 'fake-1',
      };
    }),
  };
}

type AuditRow = {
  id: string;
  projectId: string;
  status: string;
  finishedAt: Date | null;
  score: unknown;
  executiveReport: unknown;
  project: { name: string; rootUrl: string };
  findings: Array<{ rule: string; category: string; severity: string; message: string; url: string }>;
};

function makeDeps(audit: AuditRow | null, provider: LLMProvider, gscResult?: unknown): ExecutiveReportDeps {
  let currentReport = audit?.executiveReport ?? null;
  const prisma = {
    audit: {
      findUnique: vi.fn(async () => audit),
      update: vi.fn(async ({ data }: { data: { executiveReport: unknown } }) => {
        currentReport = data.executiveReport;
        return { ...audit, ...data };
      }),
    },
    pageAudit: { count: vi.fn().mockResolvedValue(1) },
    gscConnection: { findUnique: vi.fn().mockResolvedValue(gscResult ?? null) },
    gscSnapshot: { aggregate: vi.fn(), groupBy: vi.fn() },
  };
  return {
    prisma: prisma as never,
    llmProviders: { openai: provider, anthropic: undefined, openrouter: undefined },
    fetchFn: vi.fn() as never,
  };
}

const COMPLETED_AUDIT: AuditRow = {
  id: 'a1',
  projectId: 'p1',
  status: 'completed',
  finishedAt: new Date('2026-01-01'),
  score: { overall: 62, byCategory: { seo: 60 }, pagesAudited: 3, pagesTotal: 4 },
  executiveReport: null,
  project: { name: 'Test', rootUrl: 'https://example.com' },
  findings: [
    { rule: 'img-alt', category: 'a11y', severity: 'error', message: 'no alt', url: 'https://example.com/a' },
    { rule: 'title-len', category: 'seo', severity: 'warning', message: 'short', url: 'https://example.com/b' },
  ],
};

describe('loadOrGenerateExecutiveReport', () => {
  it('throws NotFound when audit is missing', async () => {
    const deps = makeDeps(null, fakeProvider(VALID_NARRATIVE));
    await expect(loadOrGenerateExecutiveReport(deps, 'missing', 'en')).rejects.toThrow(
      ExecutiveReportNotFoundError,
    );
  });

  it('throws NotCompleted when audit is not completed', async () => {
    const deps = makeDeps({ ...COMPLETED_AUDIT, status: 'running' }, fakeProvider(VALID_NARRATIVE));
    await expect(loadOrGenerateExecutiveReport(deps, 'a1', 'en')).rejects.toThrow(
      ExecutiveReportNotCompletedError,
    );
  });

  it('returns cached ready record with matching locale', async () => {
    const cached = {
      status: 'ready' as const,
      locale: 'en' as const,
      generatedAt: '2026-01-01',
      generatingStartedAt: null,
      model: 'gpt-4o',
      errorMessage: null,
      aggregates: {} as never,
      narrative: VALID_NARRATIVE,
    };
    const deps = makeDeps({ ...COMPLETED_AUDIT, executiveReport: cached }, fakeProvider(VALID_NARRATIVE));
    const result = await loadOrGenerateExecutiveReport(deps, 'a1', 'en');
    expect(result).toBe(cached);
  });

  it('returns generating record without calling LLM', async () => {
    const generating = {
      status: 'generating' as const,
      locale: 'en' as const,
      generatedAt: null,
      generatingStartedAt: new Date().toISOString(),
      model: null,
      errorMessage: null,
      aggregates: {} as never,
      narrative: null,
    };
    const provider = fakeProvider(VALID_NARRATIVE);
    const deps = makeDeps({ ...COMPLETED_AUDIT, executiveReport: generating }, provider);
    const result = await loadOrGenerateExecutiveReport(deps, 'a1', 'en');
    expect(result).toBe(generating);
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('regenerates when generating record is stale (>5min)', async () => {
    const staleGenerating = {
      status: 'generating' as const,
      locale: 'en' as const,
      generatedAt: null,
      generatingStartedAt: new Date(Date.now() - 6 * 60_000).toISOString(),
      model: null,
      errorMessage: null,
      aggregates: {} as never,
      narrative: null,
    };
    const provider = fakeProvider(VALID_NARRATIVE);
    const deps = makeDeps({ ...COMPLETED_AUDIT, executiveReport: staleGenerating }, provider);
    const result = await loadOrGenerateExecutiveReport(deps, 'a1', 'en');
    expect(result.status).toBe('ready');
    expect(provider.complete).toHaveBeenCalled();
  });

  it('generates successfully and persists ready with sanitized narrative', async () => {
    const provider = fakeProvider(VALID_NARRATIVE);
    const deps = makeDeps({ ...COMPLETED_AUDIT }, provider);
    const result = await loadOrGenerateExecutiveReport(deps, 'a1', 'en');

    expect(result.status).toBe('ready');
    expect(result.locale).toBe('en');
    expect(result.generatedAt).toBeTruthy();
    expect(result.model).toBeTruthy();
    expect(result.errorMessage).toBeNull();

    // topIssues with rule not in topRules should be dropped
    expect(result.narrative?.topIssues).toHaveLength(1);
    expect(result.narrative?.topIssues[0]?.rule).toBe('img-alt');

    // estimatedScoreFrom clamped to overall (62 < 90)
    expect(result.narrative?.scenarios[0]?.estimatedScoreFrom).toBe(62);

    // Two prisma.audit.update calls: generating then ready
    expect(deps.prisma.audit.update).toHaveBeenCalledTimes(2);
  });

  it('persists failed record on LLM error', async () => {
    const provider = fakeProvider(new Error('LLM boom'));
    const deps = makeDeps({ ...COMPLETED_AUDIT }, provider);
    const result = await loadOrGenerateExecutiveReport(deps, 'a1', 'en');

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBe('LLM boom');
    expect(result.narrative).toBeNull();
    expect(result.aggregates).toBeTruthy();
    expect(deps.prisma.audit.update).toHaveBeenCalledTimes(2);
  });
});
