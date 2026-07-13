import type { FastifyInstance, FastifyReply } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auditQueue } from '../queue.js';
import { ensureScoreSnapshot } from '../services/score-backfill.js';

const CreateAuditBody = z.object({
  projectId: z.string().min(1),
  config: z.record(z.unknown()).default({}),
});

function setAuditReadCache(reply: FastifyReply, status: string): void {
  reply.header(
    'cache-control',
    status === 'running' || status === 'queued' ? 'no-store' : 'private, max-age=10',
  );
}

function tallyPageAudits(pageAudits: Array<{ status: string; projectPage: { url: string } }>) {
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  const currentPages: string[] = [];
  for (const p of pageAudits) {
    if (p.status === 'completed') completed++;
    else if (p.status === 'failed') failed++;
    else if (p.status === 'skipped') skipped++;
    else if (p.status === 'running' && currentPages.length < 5) currentPages.push(p.projectPage.url);
  }
  return { completed, failed, skipped, currentPages };
}

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/audits', async (req, reply) => {
    const limit = Math.min(Number((req.query as { limit?: string }).limit ?? 50), 100);
    reply.header('cache-control', 'private, max-age=5');
    const rows = await prisma.audit.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { project: { select: { id: true, name: true, rootUrl: true } } },
    });
    return rows.map((a) => ({
      id: a.id,
      projectId: a.projectId,
      projectName: a.project.name,
      status: a.status,
      score: a.score,
      startedAt: a.startedAt,
      finishedAt: a.finishedAt,
      createdAt: a.createdAt,
    }));
  });

  app.post(
    '/api/audits',
    { config: { rateLimit: { max: 20, windowMs: 60_000 } } },
    async (req, reply) => {
    const parsed = CreateAuditBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const audit = await prisma.audit.create({
      data: {
        projectId: parsed.data.projectId,
        status: 'queued',
        configSnapshot: parsed.data.config as Prisma.InputJsonValue,
      },
    });
    await auditQueue.add('run', { auditId: audit.id });
    return audit;
  });

  app.get<{ Params: { id: string } }>('/api/audits/:id', async (req, reply) => {
    const audit = await prisma.audit.findUnique({
      where: { id: req.params.id },
      include: { findings: true },
    });
    if (!audit) return reply.code(404).send({ error: 'not found' });
    // Backfill v2 snapshot for audits completed before the engine shipped.
    // Idempotent: a v2 audit returns its score unchanged.
    const score = await ensureScoreSnapshot({
      id: audit.id,
      status: audit.status,
      score: audit.score,
    });
    if (score !== audit.score) {
      // Re-fetch so the response reflects the persisted v2 snapshot.
      const updated = await prisma.audit.findUnique({
        where: { id: req.params.id },
        include: { findings: true },
      });
      if (updated) return updated;
    }
    setAuditReadCache(reply, audit.status);
    return audit;
  });

  app.get<{ Params: { id: string } }>('/api/audits/:id/findings', async (req, reply) => {
    const audit = await prisma.audit.findUnique({
      where: { id: req.params.id },
      select: { status: true },
    });
    if (!audit) return reply.code(404).send({ error: 'not found' });
    setAuditReadCache(reply, audit.status);
    const findings = await prisma.finding.findMany({
      where: { auditId: req.params.id },
      orderBy: [{ severity: 'asc' }, { rule: 'asc' }],
    });
    return findings;
  });

  app.get<{ Params: { id: string } }>('/api/audits/:id/progress', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const audit = await prisma.audit.findUnique({ where: { id: req.params.id } });
    if (!audit) return reply.code(404).send({ error: 'not found' });

    const pageAudits = await prisma.pageAudit.findMany({
      where: { auditId: audit.id },
      select: { status: true, projectPage: { select: { url: true } } },
    });
    const total = pageAudits.length;
    const { completed, failed, skipped, currentPages } = tallyPageAudits(pageAudits);

    return {
      status: audit.status,
      pagesTotal: total,
      pagesCompleted: completed,
      pagesFailed: failed,
      pagesSkipped: skipped,
      currentPages,
    };
  });

  app.delete<{ Params: { id: string } }>('/api/audits/:id', async (req, reply) => {
    const audit = await prisma.audit.findUnique({ where: { id: req.params.id } });
    if (!audit) return reply.code(404).send({ error: 'not found' });
    if (['completed', 'failed', 'cancelled'].includes(audit.status)) {
      return reply.code(409).send({ error: 'audit is terminal' });
    }
    await prisma.audit.update({
      where: { id: audit.id },
      data: { status: 'cancelled', finishedAt: new Date() },
    });
    return { id: audit.id, status: 'cancelled' };
  });
}
