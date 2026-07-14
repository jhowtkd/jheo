import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Liveness — never touches dependencies. Used by docker / k8s livenessProbe.
  app.get('/api/health', async () => ({ ok: true }));

  // Readiness — checks Postgres + Redis. Used by readinessProbe so
  // orchestrators don't route traffic until the api can actually serve it.
  app.get('/api/health/ready', async (_req, reply) => {
    let pg = false;
    let redis = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      pg = true;
    } catch {
      pg = false;
    }
    // Touch the queue's connection if available — this works whether or not
    // a queue has been instantiated (the import is hoisted in queue.ts).
    try {
      const { publishQueue } = await import('../queue.js');
      const client = await publishQueue.client;
      const pong = await client.ping();
      redis = pong === 'PONG';
    } catch {
      redis = false;
    }
    const ok = pg && redis;
    return reply.code(ok ? 200 : 503).send({ ok, pg, redis });
  });
}
