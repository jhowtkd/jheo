import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { prisma } from '../db.js';

const CreateMaterialBody = z.object({
  type: z.enum(['url', 'file', 'note']),
  title: z.string().min(1).max(200),
  source: z.string().min(1),
});

function normalize(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

function contentHash(content: string): string {
  return crypto.createHash('sha256').update(normalize(content)).digest('hex');
}

async function extractUrlContent(url: string): Promise<{ title: string; content: string }> {
  const res = await fetch(url, { headers: { 'user-agent': 'JHEO/0.1 (+local)' } });
  const html = await res.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article) throw new Error('readability returned no article');
  return { title: article.title ?? 'untitled', content: article.textContent ?? '' };
}

export async function materialRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/materials',
    async (req, reply) => {
      const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
      if (!project) return reply.code(404).send({ error: 'project not found' });
      const materials = await prisma.material.findMany({
        where: { projectId: req.params.projectId },
        orderBy: { createdAt: 'desc' },
      });
      return materials.map((m) => {
        // `embedding` is `Unsupported("vector(1536)")?` in the schema, which is
        // not surfaced on the generated Prisma client type. Cast narrowly so
        // we can still surface its presence to API consumers.
        const embedding = (m as unknown as { embedding?: unknown }).embedding;
        return {
          id: m.id,
          type: m.type,
          title: m.title,
          embeddingStatus: embedding ? 'ready' : 'pending',
          charCount: m.content.length,
          createdAt: m.createdAt,
        };
      });
    },
  );

  app.post<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/materials',
    async (req, reply) => {
      const parsed = CreateMaterialBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      let title = parsed.data.title;
      let content = '';
      if (parsed.data.type === 'url') {
        const extracted = await extractUrlContent(parsed.data.source).catch((e: unknown) => {
          throw new Error(`extract failed: ${String(e)}`);
        });
        if (extracted.title) title = extracted.title;
        content = extracted.content;
      } else if (parsed.data.type === 'file') {
        content = Buffer.from(parsed.data.source, 'utf8').toString('utf8');
      } else {
        content = parsed.data.source;
      }
      const hash = contentHash(content);
      const existing = await prisma.material.findFirst({
        where: { projectId: req.params.projectId, contentHash: hash },
      });
      if (existing) {
        return reply.code(200).send({ id: existing.id, deduped: true });
      }
      const created = await prisma.material.create({
        data: {
          projectId: req.params.projectId,
          type: parsed.data.type,
          title,
          content,
          contentHash: hash,
          metadata: { source: parsed.data.source.slice(0, 500), charCount: content.length },
        },
      });
      return reply.code(201).send({ id: created.id });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/materials/:id',
    async (req, reply) => {
      const m = await prisma.material.findUnique({ where: { id: req.params.id } });
      if (!m) return reply.code(404).send({ error: 'not found' });
      await prisma.material.delete({ where: { id: m.id } });
      return { id: m.id };
    },
  );
}