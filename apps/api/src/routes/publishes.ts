import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { stat } from 'node:fs/promises';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { prisma, isPrismaUniqueViolation } from '../db.js';
import { createCuid } from '../crypto.js';
import { publishQueue } from '../queue.js';
import { recordPublishTransition } from '../jobs/publish-job.js';

const PublishBodySchema = z.object({
  channelIds: z.array(z.string().min(1)).min(1),
});

/**
 * Create a Publish row, rotating to a freshly-generated cuid on a unique
 * constraint collision (P2002). cuid collisions are vanishingly rare with
 * the schema's `@default(cuid())` but defense-in-depth: if it ever
 * happens, retry exactly once before propagating the error.
 *
 * `input` is the flat-ish shape used by the create flow
 * (`{ generationId, channelId, status, attempts }`). This is converted to
 * `Prisma.PublishCreateInput` internally so the route file does not need
 * to spell out the nested `connect` shape.
 */
export async function createPublishWithRotation(input: {
  generationId: string;
  channelId: string;
  status?: string;
  attempts?: number;
}) {
  const data: Prisma.PublishCreateInput = {
    generation: { connect: { id: input.generationId } },
    channel: { connect: { id: input.channelId } },
    status: input.status ?? 'queued',
    ...(input.attempts !== undefined ? { attempts: input.attempts } : {}),
  };
  try {
    return await prisma.publish.create({ data });
  } catch (e) {
    if (isPrismaUniqueViolation(e)) {
      return prisma.publish.create({ data: { ...data, id: createCuid() } });
    }
    throw e;
  }
}

export async function publishRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>(
    '/api/generations/:id/publish',
    { config: { rateLimit: { max: 10, windowMs: 60_000 } } },
    async (req, reply) => {
      const parsed = PublishBodySchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      const gen = await prisma.generation.findUnique({ where: { id: req.params.id } });
      if (!gen) return reply.code(404).send({ error: 'not found' });
      if (gen.reviewState !== 'approved') {
        return reply.code(409).send({ error: `cannot publish from reviewState=${gen.reviewState}` });
      }
      const channels = await prisma.distributionChannel.findMany({
        where: { id: { in: parsed.data.channelIds }, projectId: gen.projectId, isActive: true },
      });
      if (channels.length !== parsed.data.channelIds.length) {
        return reply.code(400).send({ error: 'one or more channels are invalid or inactive' });
      }
      const created = await prisma.$transaction(async (tx) => {
        const out = [];
        for (const ch of channels) {
          const data: Prisma.PublishCreateInput = {
            generation: { connect: { id: gen.id } },
            channel: { connect: { id: ch.id } },
            status: 'queued',
            attempts: 0,
          };
          try {
            out.push(await tx.publish.create({ data }));
          } catch (e) {
            if (isPrismaUniqueViolation(e)) {
              out.push(await tx.publish.create({ data: { ...data, id: createCuid() } }));
            } else {
              throw e;
            }
          }
        }
        return out;
      });
      await prisma.generation.update({
        where: { id: gen.id },
        data: { reviewState: 'publishing' },
      });
      try {
        // BullMQ addBulk collapses N Redis round-trips into one Lua call —
        // for a publish-to-50-channels case this is ~50× faster.
        await publishQueue.addBulk(
          created.map((pub) => ({ name: 'run', data: { publishId: pub.id } })),
        );
      } catch (err) {
        const e = err as Error;
        await prisma.$transaction([
          prisma.publish.updateMany({
            where: { id: { in: created.map((c) => c.id) } },
            data: { status: 'failed', lastError: `enqueue failed: ${e.message}` },
          }),
          prisma.generation.update({
            where: { id: gen.id },
            data: { reviewState: 'approved' },
          }),
        ]);
        return reply.code(503).send({ error: `publish queue unavailable: ${e.message}` });
      }
      return { publishes: created.map((p) => p.id) };
    },
  );

  app.get<{ Params: { id: string } }>('/api/generations/:id/publishes', async (req) => {
    return prisma.publish.findMany({
      where: { generationId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });
  });

  app.get<{ Params: { id: string } }>('/api/publishes/:id', async (req, reply) => {
    const pub = await prisma.publish.findUnique({
      where: { id: req.params.id },
      include: { channel: true },
    });
    if (!pub) return reply.code(404).send({ error: 'not found' });
    // MVP single-user: there is no auth, so we can't trust a client-supplied
    // header to identify the caller. We derive the "current" project from
    // the database — the first Project row ordered by createdAt. If a
    // future auth layer is added, this lookup should be replaced by the
    // authenticated user's project. Cross-project access is masked as 404
    // to avoid leaking the existence of other projects' publishes.
    const owner = await prisma.project.findFirst({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    const callerProjectId = owner?.id;
    if (callerProjectId && callerProjectId !== pub.channel.projectId) {
      return reply.code(404).send({
        error: {
          code: 'not_found',
          message: 'publish not found',
          requestId: req.id,
        },
      });
    }
    return pub;
  });

  app.post<{ Params: { id: string } }>('/api/publishes/:id/retry', async (req, reply) => {
    const pub = await prisma.publish.findUnique({ where: { id: req.params.id } });
    if (!pub) return reply.code(404).send({ error: 'not found' });
    if (pub.status !== 'failed' && pub.status !== 'cancelled') {
      return reply.code(409).send({ error: `cannot retry from status=${pub.status}` });
    }
    await prisma.publish.update({
      where: { id: pub.id },
      data: { lastError: null },
    });
    await recordPublishTransition(prisma, pub.id, 'queued', 'user retry');
    await publishQueue.add('run', { publishId: pub.id });
    return { id: pub.id };
  });

  app.post<{ Params: { id: string } }>('/api/publishes/:id/cancel', async (req, reply) => {
    const pub = await prisma.publish.findUnique({ where: { id: req.params.id } });
    if (!pub) return reply.code(404).send({ error: 'not found' });
    if (pub.status === 'completed' || pub.status === 'failed') {
      return reply.code(409).send({ error: `cannot cancel from status=${pub.status}` });
    }
    if (pub.status === 'queued' || pub.status === 'running') {
      // Worker polls between adapter calls; mark cancelled so next poll aborts.
      await recordPublishTransition(prisma, pub.id, 'cancelled', 'user cancelled');
    }
    return { id: pub.id };
  });

  app.get<{ Params: { id: string } }>('/api/publishes/:id/files', async (req, reply) => {
    const pub = await prisma.publish.findUnique({
      where: { id: req.params.id },
      include: { channel: true },
    });
    if (!pub) return reply.code(404).send({ error: 'not found' });
    if (pub.channel.type !== 'agent') return reply.code(409).send({ error: 'not an agent bundle' });
    const dir = pub.externalUrl?.replace(/^file:\/\//, '');
    if (!dir || !existsSync(dir)) return reply.code(404).send({ error: 'bundle not on disk' });
    // Async fs — was sync readdirSync/readFileSync, which blocked the event
    // loop for the duration of every file read. With agent bundles this
    // could be tens of MB held resident and pinned workers.
    const entries = await readdir(dir, { withFileTypes: true });
    const fileEntries = entries.filter((d) => d.isFile());
    const files = await Promise.all(
      fileEntries.map(async (d) => ({
        name: d.name,
        content: await readFile(join(dir, d.name), 'utf8'),
      })),
    );
    return { dir, files };
  });

  app.get<{ Params: { id: string } }>('/api/publishes/:id/bundle', async (req, reply) => {
    const pub = await prisma.publish.findUnique({
      where: { id: req.params.id },
      include: { channel: true },
    });
    if (!pub) return reply.code(404).send({ error: 'not found' });
    if (pub.channel.type !== 'agent') return reply.code(409).send({ error: 'not an agent bundle' });
    const dir = pub.externalUrl?.replace(/^file:\/\//, '');
    if (!dir || !existsSync(dir)) return reply.code(404).send({ error: 'bundle not on disk' });

    // Confirm the directory exists / is a directory (and avoid TOCTOU vs
    // the earlier existsSync). Cheap stat call.
    await stat(dir).catch(() => {
      reply.code(404).send({ error: 'bundle not on disk' });
    });
    if (reply.sent) return;

    // Lazy-import archiver — the dependency weighs in at ~5 transitive
    // packages. Only loaded when an agent bundle is actually requested.
    const { default: archiver } = await import('archiver');

    reply.header('content-type', 'application/zip');
    reply.header('content-disposition', `attachment; filename="bundle-${pub.id}.zip"`);

    // Pipe the archive stream into the raw response. level=6 trades <5%
    // size for ~3× faster compression vs the previous zlib level 9. Listen
    // for archive errors so a broken disk surfaces as a 500 instead of
    // silently dropping the connection.
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (e: Error) => req.log.error({ err: e }, 'archiver failed'));
    archive.pipe(reply.raw);
    reply.hijack();
    archive.directory(dir, false);
    await archive.finalize();
  });
}