import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { generateQueue } from '../queue.js';

const LlmConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'openrouter']),
  model: z.string().min(1).max(120),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(32000).optional(),
});

const CreateBody = z.object({
  prompt: z.string().min(1).max(20000),
  templateId: z.string().min(1),
  materialIds: z.array(z.string()).min(0).max(50),
  llmConfig: LlmConfigSchema,
});

const ReviewBody = z.object({
  action: z.enum(['send_to_review', 'approve', 'reject']),
  notes: z.string().max(2000).optional(),
});

const validTransitions: Record<string, string[]> = {
  draft: ['in_review'],
  in_review: ['draft', 'approved'],
  approved: [],
};

export async function generationRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/generations',
    async (req, reply) => {
      const parsed = CreateBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
      if (!project) return reply.code(404).send({ error: 'project not found' });
      const tmpl = await prisma.generationTemplate.findUnique({ where: { id: parsed.data.templateId } });
      if (!tmpl) return reply.code(404).send({ error: 'template not found' });
      const gen = await prisma.generation.create({
        data: {
          projectId: project.id,
          templateId: tmpl.id,
          materialIds: parsed.data.materialIds,
          prompt: parsed.data.prompt,
          status: 'queued',
          llmConfig: parsed.data.llmConfig as object,
          sources: [],
          reviewState: 'draft',
        },
      });
      await generateQueue.add('generate.run', { generationId: gen.id }).catch(() => {
        // If queueing fails (Redis down), mark failed.
        void prisma.generation.update({ where: { id: gen.id }, data: { status: 'failed' } });
      });
      return gen;
    },
  );

  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/generations',
    async (req) => {
      return prisma.generation.findMany({
        where: { projectId: req.params.projectId },
        orderBy: { createdAt: 'desc' },
      });
    },
  );

  app.get<{ Params: { id: string } }>('/api/generations/:id', async (req, reply) => {
    const row = await prisma.generation.findUnique({ where: { id: req.params.id } });
    if (!row) return reply.code(404).send({ error: 'not found' });
    return row;
  });

  app.post<{ Params: { id: string } }>('/api/generations/:id/review', async (req, reply) => {
    const parsed = ReviewBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const row = await prisma.generation.findUnique({ where: { id: req.params.id } });
    if (!row) return reply.code(404).send({ error: 'not found' });
    const allowed = validTransitions[row.reviewState] ?? [];
    const targetState =
      parsed.data.action === 'approve'
        ? 'approved'
        : parsed.data.action === 'send_to_review'
          ? 'in_review'
          : 'draft';
    if (!allowed.includes(targetState)) {
      return reply.code(409).send({ error: `cannot transition from ${row.reviewState} to ${targetState}` });
    }
    return prisma.generation.update({
      where: { id: row.id },
      data: {
        reviewState: targetState,
        reviewNotes: parsed.data.notes ?? row.reviewNotes,
      },
    });
  });

  app.patch<{ Params: { id: string } }>('/api/generations/:id', async (req, reply) => {
    const parsed = z.object({ outputMarkdown: z.string().min(50) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const row = await prisma.generation.findUnique({ where: { id: req.params.id } });
    if (!row) return reply.code(404).send({ error: 'not found' });
    if (row.reviewState === 'approved') {
      return reply.code(409).send({ error: 'cannot edit an approved generation' });
    }
    return prisma.generation.update({
      where: { id: row.id },
      data: { outputMarkdown: parsed.data.outputMarkdown },
    });
  });
}
