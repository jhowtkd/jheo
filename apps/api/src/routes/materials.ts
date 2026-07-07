import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma } from '../db.js';
import { safeFetch, UnsafeUrlError } from '../safe-fetch.js';
import { httpUrl, isHttpUrlProtocolError } from '../validation/http-url.js';
import { isSafeOutboundUrl } from '../security/url-guard.js';

const CreateMaterialBody = z
  .object({
    type: z.enum(['url', 'file', 'note']),
    title: z.string().min(1).max(200),
    source: z.string().min(1),
  })
  .superRefine((data, ctx) => {
    // Cap source size for url / file / note paths separately. The route has
    // a hard bodyLimit too (see server.ts), but we cap the JSON string here
    // so that base64-decoded files can't sneak in multi-MB payloads.
    const maxBytes = data.type === 'url' ? 2048 : 2 * 1024 * 1024;
    if (Buffer.byteLength(data.source, 'utf8') > maxBytes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['source'],
        message: `source exceeds ${maxBytes} bytes for type=${data.type}`,
      });
    }
    // For URL materials, enforce http(s)-only at the schema layer so the
    // protocol rejection is mapped to the spec's `invalid_url` error code
    // (rather than reaching the SSRF/route layer with a non-http scheme).
    if (data.type === 'url') {
      const r = httpUrl.safeParse(data.source);
      if (!r.success) {
        for (const issue of r.error.issues) {
          ctx.addIssue({ ...issue, path: ['source'] });
        }
      }
    }
  });

function normalize(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

function contentHash(content: string): string {
  return crypto.createHash('sha256').update(normalize(content)).digest('hex');
}

async function extractUrlContent(url: string): Promise<{ title: string; content: string }> {
  // safeFetch blocks RFC1918 / loopback / link-local IPs and enforces a body
  // size cap + timeout, closing the SSRF + slow-loris attack surface.
  const res = await safeFetch(url, {
    headers: { 'user-agent': 'JHEO/0.1 (+local)' },
    maxBytes: 5 * 1024 * 1024,
    timeoutMs: 10_000,
  });
  const html = await res.text();

  // Lazy-import: jsdom + readability are ~12 MB heap. Don't pay the cost
  // unless the endpoint actually has to parse a URL.
  const [{ JSDOM }, { Readability }] = await Promise.all([
    import('jsdom'),
    import('@mozilla/readability'),
  ]);
  const dom = new JSDOM(html, { url });
  try {
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (!article) throw new Error('readability returned no article');
    return { title: article.title ?? 'untitled', content: article.textContent ?? '' };
  } finally {
    dom.window.close();
  }
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
    {
      config: {
        // JSDOM+Readability per request is multi-second CPU. Cap to 30/min
        // per IP so a runaway client can't pin the workers.
        rateLimit: { max: 30, windowMs: 60_000 },
      },
    },
    async (req, reply) => {
      const parsed = CreateMaterialBody.safeParse(req.body);
      if (!parsed.success) {
        // Map http(s)-protocol rejections to the spec's `invalid_url` error
        // code so callers can distinguish URL-scheme failures from generic
        // shape errors. Other validation failures keep the flattened Zod
        // shape for backwards compatibility with existing clients.
        if (isHttpUrlProtocolError(parsed.error)) {
          return reply.code(400).send({
            error: {
              code: 'invalid_url',
              message: 'URL must be http(s)',
              requestId: req.id,
            },
          });
        }
        return reply.code(400).send({ error: parsed.error.flatten() });
      }
      let title = parsed.data.title;
      let content = '';
      if (parsed.data.type === 'url') {
        // SSRF guard (H-08): reject loopback / private / link-local targets
        // with the spec's `unsafe_url` 422 contract before any network call.
        // safeFetch below also blocks these, but a 422 here is clearer for
        // API consumers than the 400/502 wrapper currently maps them to.
        if (!(await isSafeOutboundUrl(parsed.data.source))) {
          return reply.code(422).send({
            error: {
              code: 'unsafe_url',
              message: 'URL is not safe to fetch',
              requestId: req.id,
            },
          });
        }
        try {
          const extracted = await extractUrlContent(parsed.data.source);
          if (extracted.title) title = extracted.title;
          content = extracted.content;
        } catch (e) {
          // Map SSRF rejections + timeouts to 400; everything else 502.
          if (e instanceof UnsafeUrlError) {
            return reply.code(400).send({ error: e.message });
          }
          req.log.error({ err: e, url: parsed.data.source }, 'extract failed');
          return reply.code(502).send({ error: 'failed to fetch URL' });
        }
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
      // Single round-trip: deleteMany is a no-op when nothing matches, so we
      // can return 404 based on the affected-row count instead of doing a
      // findUnique + delete pair.
      const result = await prisma.material.deleteMany({ where: { id: req.params.id } });
      if (result.count === 0) return reply.code(404).send({ error: 'not found' });
      return { id: req.params.id };
    },
  );
}
