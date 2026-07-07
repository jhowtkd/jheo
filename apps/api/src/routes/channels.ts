import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { encrypt, decrypt } from '../crypto.js';
import { loadEnv } from '../env.js';
import { LruCache } from '../lru-cache.js';
import {
  CreateChannelBodySchema,
  UpdateChannelBodySchema,
  validateConfig,
} from '../channels-config.js';

// Tiny in-process cache for `findUnique` reads. Lists read more often than
// they're written and the channel detail endpoint decrypts config — caching
// that bounded cost shaves real DB + crypto time under repeat navigation.
const channelReadCache = new LruCache<unknown>(1000, 60_000);

export async function channelRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/channels',
    async (req, reply) => {
      reply.header('cache-control', 'private, max-age=10');
      const key = `channels:list:${req.params.projectId}`;
      const payload = await channelReadCache.getOrSet(key, async () => {
        const rows = await prisma.distributionChannel.findMany({
          where: { projectId: req.params.projectId },
          orderBy: { createdAt: 'desc' },
        });
        return rows.map((r) => ({
          id: r.id,
          projectId: r.projectId,
          type: r.type,
          name: r.name,
          isActive: r.isActive,
          createdAt: r.createdAt,
        }));
      });
      return payload;
    },
  );

  app.post<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/channels',
    async (req, reply) => {
      const parsed = CreateChannelBodySchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      const { name, type, config, isActive } = parsed.data;
      let validatedConfig: unknown;
      try {
        validatedConfig = validateConfig(type, config);
      } catch (e) {
        return reply.code(400).send({ error: (e as Error).message });
      }
      const env = loadEnv();
      const secret = env.JHEO_SECRET_KEY;
      if (!secret) return reply.code(503).send({ error: 'JHEO_SECRET_KEY not set' });
      const ciphertext = encrypt(JSON.stringify(validatedConfig), secret);
      const row = await prisma.distributionChannel.create({
        data: {
          projectId: req.params.projectId,
          type,
          name,
          configEncrypted: ciphertext,
          configSchema: type,
          isActive,
        },
      });
      channelReadCache.invalidatePrefix(`channels:list:`);
      return reply.code(201).send({ id: row.id });
    },
  );

  app.get<{ Params: { id: string } }>('/api/channels/:id', async (req, reply) => {
    reply.header('cache-control', 'private, max-age=30');
    const key = `channels:detail:${req.params.id}`;
    const payload = await channelReadCache.getOrSet(key, async () => {
      const row = await prisma.distributionChannel.findUnique({ where: { id: req.params.id } });
      if (!row) return null;
      const env = loadEnv();
      let config: unknown = null;
      if (env.JHEO_SECRET_KEY) {
        try {
          const decrypted = decrypt(row.configEncrypted, env.JHEO_SECRET_KEY);
          config = JSON.parse(decrypted);
        } catch (e) {
          // Log so decryption failures aren't invisible — they're operationally
          // significant. The frontend sees `config: null` either way.
          reply.log.warn({ err: e, channelId: row.id }, 'channel decrypt failed');
        }
      }
      return {
        id: row.id,
        projectId: row.projectId,
        type: row.type,
        name: row.name,
        config,
        isActive: row.isActive,
        createdAt: row.createdAt,
      };
    });
    if (payload === null) return reply.code(404).send({ error: 'not found' });
    return payload;
  });

  app.put<{ Params: { id: string } }>('/api/channels/:id', async (req, reply) => {
    const parsed = UpdateChannelBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const row = await prisma.distributionChannel.findUnique({ where: { id: req.params.id } });
    if (!row) return reply.code(404).send({ error: 'not found' });
    const { name, config, isActive } = parsed.data;
    let configEncrypted = row.configEncrypted;
    if (config !== undefined) {
      let validatedConfig: unknown;
      try {
        validatedConfig = validateConfig(row.type, config);
      } catch (e) {
        return reply.code(400).send({ error: (e as Error).message });
      }
      const env = loadEnv();
      if (!env.JHEO_SECRET_KEY) return reply.code(503).send({ error: 'JHEO_SECRET_KEY not set' });
      configEncrypted = encrypt(JSON.stringify(validatedConfig), env.JHEO_SECRET_KEY);
    }
    const updated = await prisma.distributionChannel.update({
      where: { id: row.id },
      data: {
        ...(name !== undefined && { name }),
        ...(config !== undefined && { configEncrypted }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    // Invalidate the cached detail and any list that might include it.
    channelReadCache.invalidate(`channels:detail:${req.params.id}`);
    channelReadCache.invalidatePrefix(`channels:list:`);
    return updated;
  });

  app.delete<{ Params: { id: string } }>('/api/channels/:id', async (req, reply) => {
    const result = await prisma.distributionChannel.deleteMany({ where: { id: req.params.id } });
    if (result.count === 0) return reply.code(404).send({ error: 'not found' });
    channelReadCache.invalidatePrefix(`channels:`);
    return { id: req.params.id };
  });
}