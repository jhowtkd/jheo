import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  _resetGscCronForTest,
  enqueueDueGscSnapshots,
  GSC_CRON_SKIP_IF_SYNCED_MS,
  startGscCron,
} from '../src/gsc-cron.js';

describe('gsc-cron', () => {
  afterEach(() => {
    _resetGscCronForTest();
    vi.useRealTimers();
  });

  it('enqueues snapshot jobs for connections not synced within 20h', async () => {
    const now = new Date('2026-07-07T12:00:00.000Z');
    const staleSync = new Date(now.getTime() - GSC_CRON_SKIP_IF_SYNCED_MS - 60_000);
    const gscQueueAdd = vi.fn().mockResolvedValue(undefined);

    const prisma = {
      gscConnection: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ projectId: 'p1' }, { projectId: 'p2' }])
          .mockResolvedValueOnce([{ projectId: 'p3' }]),
      },
    };

    const result = await enqueueDueGscSnapshots({
      prisma: prisma as never,
      gscQueue: { add: gscQueueAdd },
      now,
    });

    expect(result.enqueued).toEqual(['p1', 'p2']);
    expect(gscQueueAdd).toHaveBeenCalledTimes(2);
    expect(gscQueueAdd).toHaveBeenCalledWith(
      'snapshot',
      { action: 'snapshot', projectId: 'p1' },
      { jobId: 'gsc-snapshot:p1:2026-07-07' },
    );
    expect(result.skipped).toEqual(['p3']);
    expect(staleSync.getTime()).toBeLessThan(now.getTime() - GSC_CRON_SKIP_IF_SYNCED_MS);
  });

  it('starts interval cron once and runs tick on boot', async () => {
    vi.useFakeTimers();
    const gscQueueAdd = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      gscConnection: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const log = vi.fn();

    const cron = startGscCron({
      prisma: prisma as never,
      gscQueue: { add: gscQueueAdd },
      log,
      intervalMs: 60_000,
    });

    await vi.runOnlyPendingTimersAsync();
    expect(prisma.gscConnection.findMany).toHaveBeenCalled();

    cron.stop();
  });
});
