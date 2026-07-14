import { SCORE_ENGINE_VERSION, scoreFindings } from '@jheo/core';
import { prisma } from '../db.js';

interface AuditLike {
  id: string;
  status: string;
  score: unknown;
}

function isV2Score(score: unknown): score is Record<string, unknown> {
  return (
    typeof score === 'object' &&
    score !== null &&
    typeof (score as { scoreEngineVersion?: unknown }).scoreEngineVersion === 'string' &&
    (score as { scoreEngineVersion: string }).scoreEngineVersion === SCORE_ENGINE_VERSION
  );
}

function isLegacyScore(score: unknown): score is { pagesAudited?: number; pagesTotal?: number } {
  return typeof score === 'object' && score !== null && !isV2Score(score);
}

/**
 * Re-stamp a completed audit with a v2 score snapshot if its stored score
 * pre-dates the engine. Idempotent: audits already on v2 are returned
 * unchanged. Audits not in `completed` state are also returned unchanged —
 * the orchestrator owns completion writes.
 *
 * Concurrency note: last-write-wins. For single-user backfills this is fine.
 * A second concurrent GET will just re-run the rollup against the same
 * findings, producing an equivalent snapshot. The `recomputedAt` field
 * records when the backfill ran for client display.
 */
export async function ensureScoreSnapshot(audit: AuditLike): Promise<unknown> {
  if (audit.status !== 'completed') return audit.score;
  if (!isLegacyScore(audit.score)) return audit.score;

  const findings = await prisma.finding.findMany({
    where: { auditId: audit.id },
    select: {
      category: true,
      severity: true,
      rule: true,
      message: true,
      url: true,
      evidence: true,
      selector: true,
    },
  });
  const pageAudits = await prisma.pageAudit.findMany({
    where: { auditId: audit.id },
    select: { status: true },
  });
  const pagesAudited = pageAudits.filter((p) => p.status === 'completed').length;
  const pagesWithError = pageAudits.filter((p) => p.status === 'failed').length;

  const rollup = scoreFindings(
    findings.map((f) => ({
      category: f.category as Parameters<typeof scoreFindings>[0][number]['category'],
      severity: f.severity as 'info' | 'warning' | 'error',
      rule: f.rule,
      message: f.message,
      url: f.url,
      ...(f.selector ? { selector: f.selector } : {}),
      evidence: (f.evidence ?? {}) as Record<string, unknown>,
    })),
    { pageCount: Math.max(1, pagesAudited) },
  );

  const previous = audit.score as { pagesTotal?: number; discoveryLimitReached?: boolean };
  const next = {
    overall: rollup.overall,
    byCategory: rollup.byCategory,
    pagesAudited,
    pagesTotal: previous?.pagesTotal ?? pageAudits.length,
    pagesWithError,
    discoveryLimitReached: previous?.discoveryLimitReached ?? false,
    scoreEngineVersion: SCORE_ENGINE_VERSION,
    recomputedAt: new Date().toISOString(),
  };
  await prisma.audit.update({
    where: { id: audit.id },
    data: { score: next },
  });
  return next;
}
