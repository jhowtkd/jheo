import { afterEach, describe, expect, it, vi } from 'vitest';

// `audit-job.ts` transitively imports `queue.ts` (which opens a real IORedis
// connection on module load) and `db.ts` (which opens a Prisma client). Stub
// both — we are only testing the QueueEvents lifecycle helper, not the
// handler. The bullmq mock below is the one this test actually exercises.
vi.mock('../src/queue.js', () => ({
  auditQueue: { add: vi.fn() },
  auditPageQueue: { add: vi.fn() },
  auditOrchestrator: 'polling',
  auditPageConcurrency: 5,
}));

vi.mock('../src/db.js', () => ({
  prisma: {
    audit: { findUnique: vi.fn(), update: vi.fn() },
    project: { findUnique: vi.fn() },
    projectPage: { findMany: vi.fn(), createMany: vi.fn() },
    pageAudit: { findMany: vi.fn(), createMany: vi.fn(), count: vi.fn() },
    finding: { createMany: vi.fn() },
  },
}));

const queueEventsInstances: Array<{
  close: ReturnType<typeof vi.fn>;
  run: () => unknown;
}> = [];

vi.mock('bullmq', () => {
  // Track every QueueEvents the SUT constructs so we can assert on
  // creation count + close() invocations across the whole test run.
  const QueueEvents = vi.fn().mockImplementation(() => {
    const close = vi.fn().mockResolvedValue(undefined);
    const instance = { close };
    queueEventsInstances.push(instance);
    return instance;
  });
  const FlowProducer = vi.fn();
  return { QueueEvents, FlowProducer };
});

import { QueueEvents } from 'bullmq';
import { withAuditPageQueueEvents } from '../src/jobs/audit-job.js';

afterEach(() => {
  vi.clearAllMocks();
  queueEventsInstances.length = 0;
});

describe('withAuditPageQueueEvents', () => {
  it('constructs a fresh QueueEvents for each call (no module-level reuse)', async () => {
    await withAuditPageQueueEvents(async () => undefined);
    await withAuditPageQueueEvents(async () => undefined);
    await withAuditPageQueueEvents(async () => undefined);

    expect(QueueEvents).toHaveBeenCalledTimes(3);
    expect(queueEventsInstances).toHaveLength(3);
    // Distinct object identity proves there is no cached singleton.
    expect(new Set(queueEventsInstances).size).toBe(3);
  });

  it('closes the QueueEvents after the callback resolves', async () => {
    await withAuditPageQueueEvents(async () => 42);
    expect(queueEventsInstances).toHaveLength(1);
    expect(queueEventsInstances[0].close).toHaveBeenCalledTimes(1);
  });

  it('closes the QueueEvents even when the callback throws', async () => {
    await expect(
      withAuditPageQueueEvents(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(queueEventsInstances).toHaveLength(1);
    expect(queueEventsInstances[0].close).toHaveBeenCalledTimes(1);
  });

  it('swallows a rejecting close() so cleanup never masks the original error', async () => {
    queueEventsInstances.length = 0;
    // Force the next QueueEvents instance's close() to reject — simulates
    // the underlying socket already being gone (the failure mode the
    // helper is designed to be resilient to).
    (QueueEvents as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      const close = vi.fn().mockRejectedValue(new Error('socket closed'));
      const instance = { close };
      queueEventsInstances.push(instance);
      return instance;
    });

    // The user-callback error must still propagate, not be replaced by the
    // cleanup error.
    await expect(
      withAuditPageQueueEvents(async () => {
        throw new Error('user boom');
      }),
    ).rejects.toThrow('user boom');

    expect(queueEventsInstances[0].close).toHaveBeenCalledTimes(1);
  });

  it('passes connection options that match the main worker (no give-up on transient errors)', async () => {
    // `withAuditPageQueueEvents` is invoked lazily — calling it once is
    // enough to capture the constructor argument. Await so the synchronous
    // `new QueueEvents(...)` line inside the helper has actually run
    // before we read `mock.calls`.
    await withAuditPageQueueEvents(async () => undefined);

    // `new QueueEvents(name, options)` — options land at index 1, not 0.
    const mock = QueueEvents as unknown as ReturnType<typeof vi.fn>;
    const options = mock.mock.calls[0]?.[1] as { connection: Record<string, unknown> };
    expect(options).toBeDefined();
    expect(options.connection).toEqual(
      expect.objectContaining({
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
        connectTimeout: 10_000,
      }),
    );
  });
});
