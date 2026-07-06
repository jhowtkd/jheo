import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';

const CreateBody = z.object({
  name: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/),
  prompt: z.string().min(1).max(20000),
  outputSchema: z.unknown(),
});

const UpdateBody = z.object({
  prompt: z.string().min(1).max(20000),
  outputSchema: z.unknown(),
});

export async function templateRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/templates', async () => {
    const rows = await prisma.generationTemplate.findMany({ orderBy: { name: 'asc' } });
    return rows;
  });

  app.get<{ Params: { id: string } }>('/api/templates/:id', async (req, reply) => {
    const row = await prisma.generationTemplate.findUnique({ where: { id: req.params.id } });
    if (!row) return reply.code(404).send({ error: 'not found' });
    return row;
  });

  app.post('/api/templates', async (req, reply) => {
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const existing = await prisma.generationTemplate.findFirst({
      where: { name: parsed.data.name },
    });
    if (existing) return reply.code(409).send({ error: 'name already exists; use PUT to version' });
    const row = await prisma.generationTemplate.create({
      data: {
        name: parsed.data.name,
        version: 1,
        prompt: parsed.data.prompt,
        outputSchema: parsed.data.outputSchema as object,
        isActive: false,
      },
    });
    return row;
  });

  app.put<{ Params: { id: string } }>('/api/templates/:id', async (req, reply) => {
    const parsed = UpdateBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const src = await prisma.generationTemplate.findUnique({ where: { id: req.params.id } });
    if (!src) return reply.code(404).send({ error: 'not found' });
    const max = await prisma.generationTemplate.findFirst({
      where: { name: src.name },
      orderBy: { version: 'desc' },
    });
    const newRow = await prisma.generationTemplate.create({
      data: {
        name: src.name,
        version: (max?.version ?? 0) + 1,
        prompt: parsed.data.prompt,
        outputSchema: parsed.data.outputSchema as object,
        isActive: false,
      },
    });
    return newRow;
  });

  app.patch<{ Params: { id: string } }>('/api/templates/:id/active', async (req, reply) => {
    const target = await prisma.generationTemplate.findUnique({ where: { id: req.params.id } });
    if (!target) return reply.code(404).send({ error: 'not found' });
    await prisma.$transaction([
      prisma.generationTemplate.updateMany({
        where: { name: target.name, NOT: { id: target.id } },
        data: { isActive: false },
      }),
      prisma.generationTemplate.update({
        where: { id: target.id },
        data: { isActive: true },
      }),
    ]);
    return prisma.generationTemplate.findUnique({ where: { id: target.id } });
  });
}
