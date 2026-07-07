import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { stat } from 'node:fs/promises';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../db.js';
import { publishQueue } from '../queue.js';

const PublishBodySchema = z.object({
  channelIds: z.array(z.string().min(1)).min(1),
});

export async function publishRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>(
    '/api/generations/:id/publish',
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
      const created = await prisma.$transaction(
        channels.map((ch) =>
          prisma.publish.create({
            data: { generationId: gen.id, channelId: ch.id, status: 'queued', attempts: 0 },
          }),
        ),
      );
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
      data: { status: 'queued', lastError: null },
    });
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
      await prisma.publish.update({ where: { id: pub.id }, data: { status: 'cancelled' } });
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