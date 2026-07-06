import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { encrypt } from '../crypto.js';
import { loadEnv } from '../env.js';
import {
  CreateChannelBodySchema,
  UpdateChannelBodySchema,
  validateConfig,
} from '../channels-config.js';

export async function channelRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/channels',
    async (req) => {
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
      return reply.code(201).send({ id: row.id });
    },
  );

  app.get<{ Params: { id: string } }>('/api/channels/:id', async (req, reply) => {
    const row = await prisma.distributionChannel.findUnique({ where: { id: req.params.id } });
    if (!row) return reply.code(404).send({ error: 'not found' });
    const env = loadEnv();
    if (!env.JHEO_SECRET_KEY) return reply.code(503).send({ error: 'JHEO_SECRET_KEY not set' });
    const { decrypt } = await import('../crypto.js');
    let config: unknown = null;
    try {
      config = JSON.parse(decrypt(row.configEncrypted, env.JHEO_SECRET_KEY));
    } catch {
      /* keep null */
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
    return updated;
  });

  app.delete<{ Params: { id: string } }>('/api/channels/:id', async (req, reply) => {
    const row = await prisma.distributionChannel.findUnique({ where: { id: req.params.id } });
    if (!row) return reply.code(404).send({ error: 'not found' });
    await prisma.distributionChannel.delete({ where: { id: row.id } });
    return { id: row.id };
  });
}