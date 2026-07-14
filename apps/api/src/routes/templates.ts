import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

const CreateBody = z.object({
  name: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/),
  prompt: z.string().min(1).max(20000),
  outputSchema: z.unknown(),
});

const UpdateBody = z.object({
  prompt: z.string().min(1).max(20000),
  outputSchema: z.unknown(),
});

export async function templateRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/templates', async (_req, reply) => {
    reply.header('cache-control', 'private, max-age=30');
    const rows = await prisma.generationTemplate.findMany({ orderBy: { name: 'asc' } });
    return rows;
  });

  app.get<{ Params: { id: string } }>('/api/templates/:id', async (req, reply) => {
    reply.header('cache-control', 'private, max-age=30');
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
        outputSchema: parsed.data.outputSchema as Prisma.InputJsonValue,
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
    // 2 round-trips (was 3 with findFirst): aggregate for max version, then
    // create the new version row. The previous version-trailing findUnique
    // on the active endpoint is also dropped (update() returns the row).
    const stats = await prisma.generationTemplate.aggregate({
      where: { name: src.name },
      _max: { version: true },
    });
    return prisma.generationTemplate.create({
      data: {
        name: src.name,
        version: (stats._max.version ?? 0) + 1,
        prompt: parsed.data.prompt,
        outputSchema: parsed.data.outputSchema as Prisma.InputJsonValue,
        isActive: false,
      },
    });
  });

  app.patch<{ Params: { id: string } }>('/api/templates/:id/active', async (req, reply) => {
    const target = await prisma.generationTemplate.findUnique({ where: { id: req.params.id } });
    if (!target) return reply.code(404).send({ error: 'not found' });
    // Two writes — one updateMany to deactivate siblings and one update to
    // activate the target. Run them in a single transaction so a crash
    // mid-flight can't leave the name with two active versions.
    // Drop the trailing findUnique — Prisma's update() returns the row.
    const [, activated] = await Promise.all([
      prisma.generationTemplate.updateMany({
        where: { name: target.name, NOT: { id: target.id } },
        data: { isActive: false },
      }),
      prisma.generationTemplate.update({
        where: { id: target.id },
        data: { isActive: true },
      }),
    ]);
    return activated;
  });
}
