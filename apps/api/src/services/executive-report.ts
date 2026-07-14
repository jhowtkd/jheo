import type { PrismaClient } from '@prisma/client';
import {
  buildAuditSummary,
  runExecutiveReport,
  type LLMProvider,
  type AuditSummary,
  type ExecutiveNarrative,
  type ExecutiveReportRecord,
} from '@jheo/core';
import { buildGscReportSummary } from './gsc-report-summary.js';

export type ExecutiveReportDeps = {
  prisma: PrismaClient;
  llmProviders: Record<'openai' | 'anthropic' | 'openrouter', LLMProvider>;
  fetchFn: typeof fetch;
};

export class ExecutiveReportNotFoundError extends Error {
  constructor() {
    super('AUDIT_NOT_FOUND');
    this.name = 'ExecutiveReportNotFoundError';
  }
}

export class ExecutiveReportNotCompletedError extends Error {
  constructor(public readonly status: string) {
    super('AUDIT_NOT_COMPLETED');
    this.name = 'ExecutiveReportNotCompletedError';
  }
}

function pickProvider(llm: ExecutiveReportDeps['llmProviders']): LLMProvider {
  if (llm.openai) return llm.openai;
  const first = Object.values(llm).find(Boolean);
  if (!first) throw new Error('no_llm_provider');
  return first;
}

const STALE_GENERATING_MS = 5 * 60_000;

function isStaleGenerating(cached: ExecutiveReportRecord): boolean {
  if (cached.status !== 'generating' || !cached.generatingStartedAt) return false;
  return Date.now() - new Date(cached.generatingStartedAt).getTime() > STALE_GENERATING_MS;
}

function reportModel(): string {
  return process.env.JHEO_REPORT_MODEL ?? process.env.JHEO_SUGGESTION_MODEL ?? 'gpt-4o-mini';
}

function sanitizeNarrative(
  narrative: ExecutiveNarrative,
  aggregates: AuditSummary,
): ExecutiveNarrative {
  const ruleSet = new Set(aggregates.topRules.map((r) => r.rule));
  return {
    ...narrative,
    topIssues: narrative.topIssues.filter((issue) => ruleSet.has(issue.rule)),
    scenarios: narrative.scenarios.map((s) => ({
      ...s,
      estimatedScoreFrom: Math.min(s.estimatedScoreFrom, aggregates.overall),
    })),
  };
}

export async function loadOrGenerateExecutiveReport(
  deps: ExecutiveReportDeps,
  auditId: string,
  locale: 'en' | 'pt-BR',
): Promise<ExecutiveReportRecord> {
  const audit = await deps.prisma.audit.findUnique({
    where: { id: auditId },
    include: {
      project: { select: { name: true, rootUrl: true } },
      findings: {
        select: { rule: true, category: true, severity: true, message: true, url: true },
      },
    },
  });
  if (!audit) throw new ExecutiveReportNotFoundError();
  if (audit.status !== 'completed') throw new ExecutiveReportNotCompletedError(audit.status);

  const cached = audit.executiveReport as ExecutiveReportRecord | null;
  if (cached) {
    if (cached.status === 'ready' && cached.locale === locale) return cached;
    if (cached.status === 'generating' && !isStaleGenerating(cached)) return cached;
  }

  const score = (audit.score ?? { overall: 0, byCategory: {} }) as {
    overall: number;
    byCategory: Record<string, number | null>;
    pagesAudited?: number;
    pagesTotal?: number;
  };

  const pagesFailed = await deps.prisma.pageAudit.count({
    where: { auditId, status: 'failed' },
  });

  const gsc = await buildGscReportSummary(deps.prisma, audit.projectId);

  const aggregates = buildAuditSummary({
    projectName: audit.project.name,
    rootUrl: audit.project.rootUrl,
    auditId: audit.id,
    finishedAt: audit.finishedAt?.toISOString() ?? null,
    score,
    pagesFailed,
    findings: audit.findings.map((f) => ({
      rule: f.rule,
      category: f.category,
      severity: f.severity as 'error' | 'warning' | 'info',
      message: f.message,
      url: f.url,
    })),
    ...(gsc ? { gsc } : {}),
  });

  const generating: ExecutiveReportRecord = {
    status: 'generating',
    locale,
    aggregates,
    narrative: null,
    generatedAt: null,
    generatingStartedAt: new Date().toISOString(),
    model: null,
    errorMessage: null,
  };
  await deps.prisma.audit.update({
    where: { id: auditId },
    data: { executiveReport: generating },
  });

  const provider = pickProvider(deps.llmProviders);
  try {
    const narrative = await runExecutiveReport(provider, aggregates, locale, deps.fetchFn);
    const sanitized = sanitizeNarrative(narrative, aggregates);
    const record: ExecutiveReportRecord = {
      status: 'ready',
      locale,
      aggregates,
      narrative: sanitized,
      generatedAt: new Date().toISOString(),
      generatingStartedAt: null,
      model: reportModel(),
      errorMessage: null,
    };
    await deps.prisma.audit.update({
      where: { id: auditId },
      data: { executiveReport: record },
    });
    return record;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    const record: ExecutiveReportRecord = {
      status: 'failed',
      locale,
      aggregates,
      narrative: null,
      generatedAt: null,
      generatingStartedAt: null,
      model: null,
      errorMessage,
    };
    await deps.prisma.audit.update({
      where: { id: auditId },
      data: { executiveReport: record },
    });
    return record;
  }
}
