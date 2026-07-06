import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';

const CreateProjectBody = z.object({
  name: z.string().min(1).max(120),
  rootUrl: z.string().url(),
});

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/projects', async () => prisma.project.findMany({ orderBy: { createdAt: 'desc' } }));

  app.post('/api/projects', async (req, reply) => {
    const parsed = CreateProjectBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    return prisma.project.create({ data: parsed.data });
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { audits: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
    if (!project) return reply.code(404).send({ error: 'not found' });
    return project;
  });
}
