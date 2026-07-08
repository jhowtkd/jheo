import type { Job } from 'bullmq';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  createGscClient,
  fetchSearchAnalyticsRange,
  inspectUrl,
  type GscSnapshotRow,
} from '@jheo/core';
import type { GscJobData } from '../queue.js';
import { validateServiceAccountJson } from '../gsc-config.js';
import { getGscAccessToken } from '../gsc-auth.js';
import type { ServiceAccountJson } from '../gsc-config.js';

const SNAPSHOT_RETENTION_DAYS = 28;

function snapshotDateFromIso(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/**
 * Bulk upsert via a single INSERT … ON CONFLICT per chunk.
 * Far fewer round-trips than N Prisma upserts inside a transaction.
 */
async function upsertSnapshotRows(prisma: PrismaClient, rows: GscSnapshotRow[]): Promise<void> {
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    const values = chunk.map(
      (row) =>
        Prisma.sql`(${row.projectId}, ${snapshotDateFromIso(row.date)}, ${row.query}, ${row.page}, ${row.device}, ${row.country}, ${row.clicks}, ${row.impressions}, ${row.ctr}, ${row.position})`,
    );
    await prisma.$executeRaw`
      INSERT INTO "GscSnapshot" ("projectId", "date", "query", "page", "device", "country", "clicks", "impressions", "ctr", "position")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("projectId", "date", "query", "page", "device", "country")
      DO UPDATE SET
        "clicks" = EXCLUDED."clicks",
        "impressions" = EXCLUDED."impressions",
        "ctr" = EXCLUDED."ctr",
        "position" = EXCLUDED."position"
    `;
  }
}

/** @internal exported for unit tests */
export { upsertSnapshotRows };

async function pruneOldSnapshots(prisma: PrismaClient, projectId: string): Promise<void> {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - SNAPSHOT_RETENTION_DAYS);
  await prisma.gscSnapshot.deleteMany({
    where: { projectId, date: { lt: cutoff } },
  });
}

export function makeGscHandler(deps: {
  prisma: PrismaClient;
  decrypt: (ciphertext: string, secret: string) => string;
  fetchFn: typeof fetch;
  secretKey: string | undefined;
  getAccessToken?: (sa: ServiceAccountJson) => Promise<string>;
}) {
  return async function handle(job: Job<GscJobData>): Promise<void> {
    if (job.data.action === 'inspect') {
      await handleInspect(job, deps);
      return;
    }

    const { projectId } = job.data;
    const connection = await deps.prisma.gscConnection.findUnique({ where: { projectId } });
    if (!connection) return;

    if (!deps.secretKey) {
      await deps.prisma.gscConnection.update({
        where: { projectId },
        data: {
          syncStatus: 'failed',
          syncError: 'JHEO_SECRET_KEY not set',
        },
      });
      throw new Error('JHEO_SECRET_KEY not set');
    }

    await deps.prisma.gscConnection.update({
      where: { projectId },
      data: { syncStatus: 'syncing', syncError: null },
    });

    try {
      const sa = validateServiceAccountJson(
        JSON.parse(deps.decrypt(connection.serviceAccountCiphertext, deps.secretKey)),
      );
      const client = createGscClient({
        fetchFn: deps.fetchFn,
        getAccessToken: () => (deps.getAccessToken ?? getGscAccessToken)(sa),
      });

      const endDate = new Date();
      endDate.setUTCDate(endDate.getUTCDate() - 3);
      const startDate = new Date(endDate);
      startDate.setUTCDate(startDate.getUTCDate() - (SNAPSHOT_RETENTION_DAYS - 1));

      const rows = await fetchSearchAnalyticsRange(client, projectId, {
        siteUrl: connection.siteUrl,
        startDate,
        endDate,
        dataState: 'final',
      });

      await upsertSnapshotRows(deps.prisma, rows);
      await pruneOldSnapshots(deps.prisma, projectId);

      await deps.prisma.gscConnection.update({
        where: { projectId },
        data: {
          syncStatus: 'ok',
          syncError: null,
          lastSyncAt: new Date(),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await deps.prisma.gscConnection.update({
        where: { projectId },
        data: {
          syncStatus: 'failed',
          syncError: message,
        },
      });
      throw err;
    }
  };
}

async function handleInspect(
  job: Job<GscJobData>,
  deps: {
    prisma: PrismaClient;
    decrypt: (ciphertext: string, secret: string) => string;
    fetchFn: typeof fetch;
    secretKey: string | undefined;
    getAccessToken?: (sa: ServiceAccountJson) => Promise<string>;
  },
): Promise<void> {
  if (job.data.action !== 'inspect') return;
  const { projectId, inspectionUrl, publishId } = job.data;
  const connection = await deps.prisma.gscConnection.findUnique({ where: { projectId } });
  if (!connection) {
    await job.log(`GSC inspect skipped: no connection for project ${projectId}`);
    return;
  }
  if (!deps.secretKey) {
    await job.log('GSC inspect skipped: JHEO_SECRET_KEY not set');
    return;
  }

  try {
    const sa = validateServiceAccountJson(
      JSON.parse(deps.decrypt(connection.serviceAccountCiphertext, deps.secretKey)),
    );
    const client = createGscClient({
      fetchFn: deps.fetchFn,
      getAccessToken: () => (deps.getAccessToken ?? getGscAccessToken)(sa),
    });
    const result = await inspectUrl(client, {
      siteUrl: connection.siteUrl,
      inspectionUrl,
    });
    const verdict = result.indexStatusResult?.verdict ?? 'unknown';
    const message = `GSC URL Inspection for ${inspectionUrl}: verdict=${verdict}`;
    await job.log(message);
    if (publishId) {
      await deps.prisma.publishEvent.create({
        data: {
          publishId,
          fromStatus: 'completed',
          toStatus: 'completed',
          message,
        },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await job.log(`GSC URL Inspection failed for ${inspectionUrl}: ${message}`);
  }
}
