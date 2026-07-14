import { describe, it, expect, vi } from 'vitest';
import type { LLMProvider } from '../../src/llm/types.js';
import { runExecutiveReport, ExecutiveReportLlmError } from '../../src/reports/run-executive-report.js';
import type { AuditSummary, ExecutiveNarrative } from '../../src/reports/schema.js';

const summary: AuditSummary = {
  projectName: 'Acme',
  rootUrl: 'https://example.com/',
  auditId: 'a1',
  finishedAt: '2026-07-10T10:00:00.000Z',
  overall: 72,
  byCategory: { seo: 80, cwv: 65, geo: null, a11y: 70, content: 75 },
  pagesAudited: 10,
  pagesTotal: 12,
  pagesFailed: 2,
  severityCounts: { error: 5, warning: 12, info: 3 },
  topRules: [
    { rule: 'meta.missing-description', affectedPages: 4, maxSeverity: 'warning', sampleMessage: 'Meta description is missing', sortScore: 10 },
  ],
};

const validNarrative: ExecutiveNarrative = {
  executiveSummary: 'O site apresenta oportunidades claras de melhoria em SEO técnico e performance, com foco em descrições ausentes.',
  topIssues: [
    { rule: 'meta.missing-description', title: 'Descrições meta ausentes', businessImpact: 'Reduz CTR nas buscas', impactLevel: 'high', affectedPages: 4 },
  ],
  scenarios: [
    { label: 'Corrigir todas as descrições', estimatedScoreFrom: 72, estimatedScoreTo: 85, rationale: 'Meta descriptions melhoram CTR.' },
  ],
  recommendations: [
    'Adicionar meta descriptions em todas as páginas faltantes.',
  ],
};

function makeProvider(respond: (prompt: string, callIndex: number) => string): LLMProvider {
  let calls = 0;
  return {
    complete: vi.fn(async (req) => {
      calls += 1;
      return {
        text: respond(req.prompt, calls),
        usage: { promptTokens: 0, completionTokens: 0 },
        provider: 'fake',
        model: 'fake-1',
      };
    }),
  };
}

describe('runExecutiveReport', () => {
  it('parses a valid LLM JSON output', async () => {
    const out = await runExecutiveReport(
      makeProvider(() => JSON.stringify(validNarrative)),
      summary,
      'pt-BR',
    );
    expect(out.executiveSummary).toBe(validNarrative.executiveSummary);
    expect(out.topIssues[0]?.rule).toBe('meta.missing-description');
  });

  it('throws ExecutiveReportLlmError on invalid JSON', async () => {
    await expect(
      runExecutiveReport(makeProvider(() => 'not json at all'), summary, 'en'),
    ).rejects.toBeInstanceOf(ExecutiveReportLlmError);
  });

  it('throws ExecutiveReportLlmError on JSON missing required fields', async () => {
    await expect(
      runExecutiveReport(makeProvider(() => JSON.stringify({ executiveSummary: 'too short' })), summary, 'en'),
    ).rejects.toBeInstanceOf(ExecutiveReportLlmError);
  });

  it('parses JSON after a MiniMax-style <think> prefix', async () => {
    const raw = `<think>\nI considered the audit data { "fake": true }.\n</think>\n\n${JSON.stringify(validNarrative)}`;
    const out = await runExecutiveReport(makeProvider(() => raw), summary, 'pt-BR');
    expect(out.executiveSummary).toBe(validNarrative.executiveSummary);
  });

  it('retries once on schema failure then succeeds', async () => {
    const provider = makeProvider((_prompt, idx) => {
      if (idx === 1) return JSON.stringify({ bad: true });
      return JSON.stringify(validNarrative);
    });
    const out = await runExecutiveReport(provider, summary, 'en');
    expect(out.executiveSummary).toBe(validNarrative.executiveSummary);
    expect(provider.complete).toHaveBeenCalledTimes(2);
  });

  it('coerces MiniMax-style affectedPages URL arrays into counts', async () => {
    const withArrays = {
      ...validNarrative,
      topIssues: [
        {
          rule: 'meta.missing-description',
          title: 'Descrições meta ausentes',
          businessImpact: 'Reduz CTR nas buscas',
          impactLevel: 'high' as const,
          affectedPages: ['/a', '/b', '/c', '/d'],
        },
      ],
    };
    const out = await runExecutiveReport(
      makeProvider(() => JSON.stringify(withArrays)),
      summary,
      'pt-BR',
    );
    expect(out.topIssues[0]?.affectedPages).toBe(4);
  });

  it('attaches raw text to ExecutiveReportLlmError', async () => {
    try {
      await runExecutiveReport(makeProvider(() => 'not json'), summary, 'en');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ExecutiveReportLlmError);
      expect((e as ExecutiveReportLlmError).raw).toBe('not json');
    }
  });
});
