import type { Job } from 'bullmq';
import type { PrismaClient } from '@prisma/client';
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

async function upsertSnapshotRows(prisma: PrismaClient, rows: GscSnapshotRow[]): Promise<void> {
  const chunkSize = 100;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await prisma.$transaction(
      chunk.map((row) =>
        prisma.gscSnapshot.upsert({
          where: {
            projectId_date_query_page_device_country: {
              projectId: row.projectId,
              date: snapshotDateFromIso(row.date),
              query: row.query,
              page: row.page,
              device: row.device,
              country: row.country,
            },
          },
          create: {
            projectId: row.projectId,
            date: snapshotDateFromIso(row.date),
            query: row.query,
            page: row.page,
            device: row.device,
            country: row.country,
            clicks: row.clicks,
            impressions: row.impressions,
            ctr: row.ctr,
            position: row.position,
          },
          update: {
            clicks: row.clicks,
            impressions: row.impressions,
            ctr: row.ctr,
            position: row.position,
          },
        }),
      ),
    );
  }
}

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
