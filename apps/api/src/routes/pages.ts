import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

const SEV_RANK: Record<string, number> = { info: 0, warning: 1, error: 2 };

function diffLabel(
  newF: { severity: string; message: string; previousFindingId: string | null },
  prior: { severity: string; message: string } | null,
): 'NEW' | 'UNCHANGED' | 'IMPROVEMENT' | 'REGRESSION' {
  if (!prior) return 'NEW';
  if (newF.severity === prior.severity && newF.message === prior.message) return 'UNCHANGED';
  const newRank = SEV_RANK[newF.severity] ?? 0;
  const priorRank = SEV_RANK[prior.severity] ?? 0;
  if (newRank < priorRank) return 'IMPROVEMENT';
  if (newRank > priorRank) return 'REGRESSION';
  return 'REGRESSION'; // same severity, different message
}

export async function pageRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>('/api/pages/:id/audit', async (req, reply) => {
    const page = await prisma.projectPage.findUnique({ where: { id: req.params.id } });
    if (!page) return reply.code(404).send({ error: 'not found' });

    const existing = await prisma.pageAudit.findFirst({
      where: { projectPageId: page.id, status: { in: ['queued', 'running'] } },
    });
    if (existing) return reply.code(409).send({ error: 're-audit in progress' });

    const pageAudit = await prisma.pageAudit.create({
      data: {
        projectPageId: page.id,
        status: 'queued',
      },
    });
    // Enqueue via the page-audit queue. auditId is null because this is a
    // standalone re-audit (F5.4) — the worker treats null as standalone and
    // skips the parent-Audit cancellation check.
    const { auditPageQueue } = await import('../queue.js');
    await auditPageQueue.add('standalone', {
      pageAuditId: pageAudit.id,
      auditId: null,
      projectPageId: page.id,
      url: page.url,
    });
    return { pageAuditId: pageAudit.id };
  });

  app.get<{ Params: { id: string } }>('/api/page-audits/:id', async (req, reply) => {
    reply.header('cache-control', 'private, max-age=5');
    const pageAudit = await prisma.pageAudit.findUnique({
      where: { id: req.params.id },
      include: {
        findings: { include: { previousFinding: true } },
        projectPage: { select: { id: true, url: true, projectId: true } },
      },
    });
    if (!pageAudit) return reply.code(404).send({ error: 'not found' });

    // Compute diff labels (NEW | UNCHANGED | IMPROVEMENT | REGRESSION).
    const findings = pageAudit.findings.map((f) => {
      const label = diffLabel(
        { severity: f.severity, message: f.message, previousFindingId: f.previousFindingId },
        f.previousFinding ? { severity: f.previousFinding.severity, message: f.previousFinding.message } : null,
      );
      return {
        id: f.id,
        category: f.category,
        severity: f.severity,
        rule: f.rule,
        message: f.message,
        url: f.url,
        selector: f.selector,
        evidence: f.evidence,
        previousFindingId: f.previousFindingId,
        diff: label,
      };
    });

    // Compute FIXED: prior head Finding ids from the immediately prior
    // completed PageAudit for this page that are not referenced by any
    // finding in the current PageAudit (via previousFindingId).
    const priorPageAudit = await prisma.pageAudit.findFirst({
      where: {
        projectPageId: pageAudit.projectPageId,
        status: 'completed',
        id: { not: pageAudit.id },
        finishedAt: { lt: pageAudit.finishedAt ?? new Date(0) },
      },
      orderBy: { finishedAt: 'desc' },
      include: {
        findings: {
          where: { previousFindingId: null },
          select: { id: true, rule: true, category: true, severity: true, message: true, url: true },
        },
      },
    });
    const currentHeads = new Set(
      pageAudit.findings
        .map((f) => f.previousFindingId)
        .filter((id): id is string => Boolean(id)),
    );
    const fixed = priorPageAudit
      ? priorPageAudit.findings
          .filter((f) => !currentHeads.has(f.id))
          .map((f) => ({
            id: f.id,
            category: f.category,
            severity: f.severity,
            rule: f.rule,
            message: f.message,
            url: f.url,
          }))
      : [];

    return {
      id: pageAudit.id,
      projectPageId: pageAudit.projectPageId,
      url: pageAudit.projectPage.url,
      status: pageAudit.status,
      score: pageAudit.score,
      startedAt: pageAudit.startedAt,
      finishedAt: pageAudit.finishedAt,
      errorMessage: pageAudit.errorMessage,
      findings,
      fixed,
    };
  });
}
