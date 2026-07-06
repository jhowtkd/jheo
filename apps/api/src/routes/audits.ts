import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auditQueue } from '../queue.js';

const CreateAuditBody = z.object({
  projectId: z.string().min(1),
  config: z.record(z.unknown()).default({}),
});

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/audits', async (req, reply) => {
    const parsed = CreateAuditBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const audit = await prisma.audit.create({
      data: {
        projectId: parsed.data.projectId,
        status: 'queued',
        configSnapshot: parsed.data.config as object,
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
}
