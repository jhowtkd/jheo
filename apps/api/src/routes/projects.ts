import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auditQueue } from '../queue.js';

const CreateProjectBody = z.object({
  name: z.string().min(1).max(120).optional(),
  rootUrl: z.string().min(1).optional(),
  domain: z.string().min(1).optional(),
}).refine((value) => value.rootUrl || value.domain, {
  message: 'domain is required',
});

function domainUrl(input: string): URL {
  const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol');
  return new URL('/', url.origin);
}

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/projects', async (_req, reply) => {
    reply.header('cache-control', 'private, max-age=15');
    return prisma.project.findMany({ orderBy: { createdAt: 'desc' } });
  });

  app.post('/api/projects', async (req, reply) => {
    const parsed = CreateProjectBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    let root: URL;
    try {
      root = domainUrl(parsed.data.domain ?? parsed.data.rootUrl!);
    } catch {
      return reply.code(400).send({ error: 'invalid domain' });
    }
    const project = await prisma.project.create({
      data: { name: parsed.data.name ?? root.hostname, rootUrl: root.toString() },
    });
    const audit = await prisma.audit.create({
      data: { projectId: project.id, status: 'queued', configSnapshot: {} },
    });
    await auditQueue.add('run', { auditId: audit.id });
    return project;
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    reply.header('cache-control', 'private, max-age=10');
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        audits: { orderBy: { createdAt: 'desc' }, take: 10 },
        pages: { orderBy: { url: 'asc' } },
      },
    });
    if (!project) return reply.code(404).send({ error: 'not found' });
    return project;
  });
}
