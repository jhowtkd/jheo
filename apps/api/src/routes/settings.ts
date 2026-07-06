import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { encrypt } from '../crypto.js';
import { loadEnv } from '../env.js';

const PutBody = z.object({ value: z.string().min(1).max(8192) });

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/settings', async () => {
    const rows = await prisma.setting.findMany({ orderBy: { key: 'asc' } });
    return rows.map((r) => ({ key: r.key, updatedAt: r.updatedAt }));
  });

  app.put<{ Params: { key: string } }>(
    '/api/settings/:key',
    async (req, reply) => {
      const key = req.params.key;
      if (!/^[a-z][a-z0-9_]*$/.test(key)) {
        return reply.code(400).send({ error: 'invalid key' });
      }
      const parsed = PutBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      const env = loadEnv();
      const secret = env.JHEO_SECRET_KEY;
      if (!secret) return reply.code(503).send({ error: 'JHEO_SECRET_KEY not set' });
      const ciphertext = encrypt(parsed.data.value, secret);
      const row = await prisma.setting.upsert({
        where: { key },
        update: { valueCiphertext: ciphertext },
        create: { key, valueCiphertext: ciphertext },
      });
      return { key: row.key, updatedAt: row.updatedAt };
    },
  );

  app.delete<{ Params: { key: string } }>('/api/settings/:key', async (req, reply) => {
    const row = await prisma.setting.findUnique({ where: { key: req.params.key } });
    if (!row) return reply.code(404).send({ error: 'not found' });
    await prisma.setting.delete({ where: { key: req.params.key } });
    return { key: row.key };
  });
}