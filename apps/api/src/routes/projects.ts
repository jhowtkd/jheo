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

const PagesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  filter: z.enum(['not_audited', 'with_error', 'discovered_via:root', 'discovered_via:sitemap', 'discovered_via:crawl']).optional(),
});

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

  app.get<{ Params: { id: string }; Querystring: { limit?: string; offset?: string; filter?: string } }>('/api/projects/:id/pages', async (req, reply) => {
    reply.header('cache-control', 'private, max-age=5');
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return reply.code(404).send({ error: 'not found' });

    const parsed = PagesQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const where: { projectId: string; lastAuditedAt?: null | { not: null }; discoveredVia?: string } = {
      projectId: project.id,
    };
    if (parsed.data.filter === 'not_audited') where.lastAuditedAt = null;
    if (parsed.data.filter === 'with_error') where.lastAuditedAt = { not: null };
    if (parsed.data.filter?.startsWith('discovered_via:')) {
      where.discoveredVia = parsed.data.filter.split(':')[1]!;
    }

    const [pages, total] = await Promise.all([
      prisma.projectPage.findMany({
        where,
        orderBy: { url: 'asc' },
        take: parsed.data.limit,
        skip: parsed.data.offset,
        // TODO(F5.3-T2): pageAudits is added in F5.3; remove @ts-expect-error when relation is in schema.
        // Phase 3 will add the `pageAudits` relation to `ProjectPage` and regenerate
        // the Prisma client. The include below is correct forward-compatibly; in
        // Phase 2 it always yields an empty array, so `lastScore` is always null.
        include: {
          // @ts-expect-error -- `pageAudits` relation arrives in Phase 3 (F5 mapping UX).
          pageAudits: {
            where: { status: 'completed' },
            orderBy: { finishedAt: 'desc' },
            take: 1,
            select: { score: true, finishedAt: true },
          },
        },
      }),
      prisma.projectPage.count({ where }),
    ]);

    return {
      total,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
      items: pages.map((p) => ({
        id: p.id,
        url: p.url,
        discoveredVia: p.discoveredVia,
        lastAuditedAt: p.lastAuditedAt,
        // @ts-expect-error -- `pageAudits` is added in Phase 3 (F5 mapping UX).
        lastScore: p.pageAudits[0]?.score ?? null,
      })),
    };
  });
}
