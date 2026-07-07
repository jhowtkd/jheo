import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { encrypt, decrypt } from '../crypto.js';
import { loadEnv } from '../env.js';
import {
  PutGscConnectionBodySchema,
  validateServiceAccountJson,
  type ServiceAccountJson,
} from '../gsc-config.js';
import { testGscConnection } from '../gsc-auth.js';
import { gscQueue } from '../queue.js';
import {
  buildFreshness,
  fetchGscOverview,
  fetchGscTopPages,
  fetchGscTopQueries,
  GscDaysQuerySchema,
  GscLimitQuerySchema,
} from '../gsc-read.js';

type SafeConnectionStatus = {
  projectId: string;
  siteUrl: string;
  lastSyncAt: Date | null;
  syncStatus: string;
  syncError: string | null;
  clientEmail: string | null;
};

async function findProjectOrNull(projectId: string) {
  return prisma.project.findUnique({ where: { id: projectId } });
}

function parseServiceAccountFromRow(
  ciphertext: string,
  secret: string,
): { sa: ServiceAccountJson | null; decryptError: boolean } {
  try {
    const decrypted = decrypt(ciphertext, secret);
    const sa = validateServiceAccountJson(JSON.parse(decrypted));
    return { sa, decryptError: false };
  } catch {
    return { sa: null, decryptError: true };
  }
}

async function buildSafeConnectionStatus(
  row: {
    projectId: string;
    siteUrl: string;
    serviceAccountCiphertext: string;
    lastSyncAt: Date | null;
    syncStatus: string;
    syncError: string | null;
  },
  secret: string | undefined,
  log: FastifyInstance['log'],
): Promise<SafeConnectionStatus> {
  if (!secret) {
    return {
      projectId: row.projectId,
      siteUrl: row.siteUrl,
      lastSyncAt: row.lastSyncAt,
      syncStatus: row.syncStatus,
      syncError: row.syncError,
      clientEmail: null,
    };
  }

  const { sa, decryptError } = parseServiceAccountFromRow(row.serviceAccountCiphertext, secret);
  if (decryptError) {
    await prisma.gscConnection.update({
      where: { projectId: row.projectId },
      data: {
        syncStatus: 'decrypt_error',
        syncError: 'Encryption key changed — re-upload Service Account JSON',
      },
    });
    log.warn({ projectId: row.projectId }, 'gsc connection decrypt failed');
    return {
      projectId: row.projectId,
      siteUrl: row.siteUrl,
      lastSyncAt: row.lastSyncAt,
      syncStatus: 'decrypt_error',
      syncError: 'Encryption key changed — re-upload Service Account JSON',
      clientEmail: null,
    };
  }

  return {
    projectId: row.projectId,
    siteUrl: row.siteUrl,
    lastSyncAt: row.lastSyncAt,
    syncStatus: row.syncStatus,
    syncError: row.syncError,
    clientEmail: sa?.client_email ?? null,
  };
}

export async function gscRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/gsc/connection',
    async (req, reply) => {
      const project = await findProjectOrNull(req.params.projectId);
      if (!project) return reply.code(404).send({ error: 'project not found' });

      const row = await prisma.gscConnection.findUnique({
        where: { projectId: req.params.projectId },
      });
      if (!row) return reply.code(404).send({ error: 'not connected' });

      const env = loadEnv();
      return buildSafeConnectionStatus(row, env.JHEO_SECRET_KEY, req.log);
    },
  );

  app.put<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/gsc/connection',
    async (req, reply) => {
      const parsed = PutGscConnectionBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      let sa: ServiceAccountJson;
      try {
        sa = validateServiceAccountJson(parsed.data.serviceAccountJson);
      } catch (e) {
        if (e instanceof z.ZodError) {
          return reply.code(400).send({ error: e.flatten() });
        }
        throw e;
      }

      const env = loadEnv();
      const secret = env.JHEO_SECRET_KEY;
      if (!secret) return reply.code(503).send({ error: 'JHEO_SECRET_KEY not set' });

      const project = await findProjectOrNull(req.params.projectId);
      if (!project) return reply.code(404).send({ error: 'project not found' });

      const siteUrl = parsed.data.siteUrl;
      const testResult = await testGscConnection(siteUrl, sa);
      if (!testResult.ok) {
        if (testResult.code === 'permission_denied') {
          return reply.code(403).send({
            error: {
              code: 'gsc_permission_denied',
              message: testResult.message,
              requestId: req.id,
            },
          });
        }
        if (testResult.code === 'site_not_found') {
          return reply.code(404).send({
            error: {
              code: 'gsc_site_not_found',
              message: testResult.message,
              requestId: req.id,
            },
          });
        }
        return reply.code(502).send({
          error: {
            code: 'gsc_api_error',
            message: testResult.message,
            requestId: req.id,
          },
        });
      }

      const ciphertext = encrypt(JSON.stringify(sa), secret);
      const row = await prisma.gscConnection.upsert({
        where: { projectId: req.params.projectId },
        update: {
          siteUrl,
          serviceAccountCiphertext: ciphertext,
          syncStatus: 'ok',
          syncError: null,
        },
        create: {
          projectId: req.params.projectId,
          siteUrl,
          serviceAccountCiphertext: ciphertext,
          syncStatus: 'ok',
        },
      });

      return {
        projectId: row.projectId,
        siteUrl: row.siteUrl,
        lastSyncAt: row.lastSyncAt,
        syncStatus: row.syncStatus,
        syncError: row.syncError,
        clientEmail: sa.client_email,
      };
    },
  );

  app.delete<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/gsc/connection',
    async (req, reply) => {
      const project = await findProjectOrNull(req.params.projectId);
      if (!project) return reply.code(404).send({ error: 'project not found' });

      const result = await prisma.gscConnection.deleteMany({
        where: { projectId: req.params.projectId },
      });
      if (result.count === 0) return reply.code(404).send({ error: 'not connected' });
      return { projectId: req.params.projectId };
    },
  );

  app.get<{ Params: { projectId: string }; Querystring: { days?: string } }>(
    '/api/projects/:projectId/gsc/overview',
    async (req, reply) => {
      const project = await findProjectOrNull(req.params.projectId);
      if (!project) return reply.code(404).send({ error: 'project not found' });

      const connection = await prisma.gscConnection.findUnique({
        where: { projectId: req.params.projectId },
      });
      if (!connection) return reply.code(404).send({ error: 'not connected' });

      const parsed = GscDaysQuerySchema.safeParse(req.query);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      const metrics = await fetchGscOverview(prisma, req.params.projectId, parsed.data.days);
      return {
        ...metrics,
        freshness: buildFreshness(connection, parsed.data.days),
      };
    },
  );

  app.get<{ Params: { projectId: string }; Querystring: { days?: string; limit?: string } }>(
    '/api/projects/:projectId/gsc/queries',
    async (req, reply) => {
      const project = await findProjectOrNull(req.params.projectId);
      if (!project) return reply.code(404).send({ error: 'project not found' });

      const connection = await prisma.gscConnection.findUnique({
        where: { projectId: req.params.projectId },
      });
      if (!connection) return reply.code(404).send({ error: 'not connected' });

      const parsed = GscLimitQuerySchema.safeParse(req.query);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      const rows = await fetchGscTopQueries(
        prisma,
        req.params.projectId,
        parsed.data.days,
        parsed.data.limit,
      );
      return {
        rows,
        freshness: buildFreshness(connection, parsed.data.days),
      };
    },
  );

  app.get<{ Params: { projectId: string }; Querystring: { days?: string; limit?: string } }>(
    '/api/projects/:projectId/gsc/pages',
    async (req, reply) => {
      const project = await findProjectOrNull(req.params.projectId);
      if (!project) return reply.code(404).send({ error: 'project not found' });

      const connection = await prisma.gscConnection.findUnique({
        where: { projectId: req.params.projectId },
      });
      if (!connection) return reply.code(404).send({ error: 'not connected' });

      const parsed = GscLimitQuerySchema.safeParse(req.query);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      const rows = await fetchGscTopPages(
        prisma,
        req.params.projectId,
        parsed.data.days,
        parsed.data.limit,
      );
      return {
        rows,
        freshness: buildFreshness(connection, parsed.data.days),
      };
    },
  );

  app.post<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/gsc/sync',
    { config: { rateLimit: { max: 5, windowMs: 60_000 } } },
    async (req, reply) => {
      const project = await findProjectOrNull(req.params.projectId);
      if (!project) return reply.code(404).send({ error: 'project not found' });

      const connection = await prisma.gscConnection.findUnique({
        where: { projectId: req.params.projectId },
      });
      if (!connection) return reply.code(404).send({ error: 'not connected' });

      if (connection.syncStatus === 'syncing') {
        return reply.code(409).send({ error: 'sync already in progress' });
      }

      const today = new Date().toISOString().slice(0, 10);
      await gscQueue.add(
        'snapshot',
        { action: 'snapshot', projectId: req.params.projectId },
        { jobId: `gsc-snapshot:${req.params.projectId}:${today}` },
      );

      return reply.code(202).send({
        projectId: req.params.projectId,
        status: 'queued',
        freshness: buildFreshness(connection, 28),
      });
    },
  );
}
