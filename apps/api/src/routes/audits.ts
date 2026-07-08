import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auditQueue } from '../queue.js';

const CreateAuditBody = z.object({
  projectId: z.string().min(1),
  config: z.record(z.unknown()).default({}),
});

export async function auditRoutes(app: FastifyInstance): Promise<void> {
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
    return audit;
  });

  app.get<{ Params: { id: string } }>('/api/audits/:id/findings', async (req) => {
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
    const completed = pageAudits.filter((p) => p.status === 'completed').length;
    const failed = pageAudits.filter((p) => p.status === 'failed').length;
    const skipped = pageAudits.filter((p) => p.status === 'skipped').length;
    const currentPages = pageAudits
      .filter((p) => p.status === 'running')
      .slice(0, 5)
      .map((p) => p.projectPage.url);

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
