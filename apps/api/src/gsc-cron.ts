import type { PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { GscJobData } from './queue.js';

export const GSC_CRON_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const GSC_CRON_SKIP_IF_SYNCED_MS = 20 * 60 * 60 * 1000;

export async function enqueueDueGscSnapshots(deps: {
  prisma: PrismaClient;
  gscQueue: Pick<Queue<GscJobData>, 'add'>;
  now?: Date;
}): Promise<{ enqueued: string[]; skipped: string[] }> {
  const now = deps.now ?? new Date();
  const cutoff = new Date(now.getTime() - GSC_CRON_SKIP_IF_SYNCED_MS);
  const today = now.toISOString().slice(0, 10);

  const connections = await deps.prisma.gscConnection.findMany({
    where: {
      syncStatus: { not: 'syncing' },
      OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: cutoff } }],
    },
    select: { projectId: true },
  });

  const enqueued: string[] = [];
  for (const conn of connections) {
    await deps.gscQueue.add(
      'snapshot',
      { action: 'snapshot', projectId: conn.projectId },
      { jobId: `gsc-snapshot:${conn.projectId}:${today}` },
    );
    enqueued.push(conn.projectId);
  }

  const skippedRows = await deps.prisma.gscConnection.findMany({
    where: {
      OR: [{ syncStatus: 'syncing' }, { lastSyncAt: { gte: cutoff } }],
    },
    select: { projectId: true },
  });
  const skipped = skippedRows.map((row) => row.projectId);

  return { enqueued, skipped };
}

let cronStarted = false;

export function startGscCron(deps: {
  prisma: PrismaClient;
  gscQueue: Pick<Queue<GscJobData>, 'add'>;
  log?: (message: string, detail?: Record<string, unknown>) => void;
  intervalMs?: number;
  runOnStart?: boolean;
}): { stop: () => void } {
  if (cronStarted) {
    return { stop: () => {} };
  }
  cronStarted = true;

  const intervalMs = deps.intervalMs ?? GSC_CRON_INTERVAL_MS;
  const log = deps.log ?? (() => {});

  const tick = async () => {
    try {
      const result = await enqueueDueGscSnapshots({
        prisma: deps.prisma,
        gscQueue: deps.gscQueue,
      });
      if (result.enqueued.length > 0 || result.skipped.length > 0) {
        log('gsc cron tick', result);
      }
    } catch (err) {
      log('gsc cron tick failed', { error: err instanceof Error ? err.message : String(err) });
    }
  };

  if (deps.runOnStart !== false) {
    void tick();
  }

  const handle = setInterval(() => void tick(), intervalMs);
  return {
    stop: () => {
      clearInterval(handle);
      cronStarted = false;
    },
  };
}

/** Test helper — reset singleton guard between tests. */
export function _resetGscCronForTest(): void {
  cronStarted = false;
}
