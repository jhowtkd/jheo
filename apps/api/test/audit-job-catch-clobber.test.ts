import { afterEach, describe, expect, it, vi } from 'vitest';

// Force the polling orchestrator — the catch-block clobber regression is
// orchestrator-agnostic, but the polling path lets us trigger the throw
// deterministically by rejecting the queue's `.add` call.
vi.mock('../src/queue.js', () => ({
  auditQueue: { add: vi.fn() },
  auditPageQueue: { add: vi.fn() },
  auditOrchestrator: 'polling',
  auditPageConcurrency: 5,
}));

// Mock set matches `audit-job-cache.test.ts` so the handler reaches
// `runPollingOrchestrator` and actually calls `auditPageQueue.add`
// (without `pageAudit.findFirst` returning a value, the polling loop
// skips the add call and we never trigger the throw).
vi.mock('../src/db.js', () => ({
  prisma: {
    audit: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      // The catch block uses updateMany with
      // `where: { id, status: 'running' }`. Per-test mocks below set
      // the exact count returned — `count: 1` for the happy failure
      // path, `count: 0` to simulate a manual completion.
      updateMany: vi.fn(),
    },
    project: { findUnique: vi.fn() },
    projectPage: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      updateMany: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn().mockResolvedValue([{ id: 'pp1', url: 'https://example.com/' }]),
    },
    pageAudit: {
      create: vi.fn().mockResolvedValue({ id: 'pa1' }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn(),
      // The polling loop calls `findFirst` per page and skips when the
      // row is missing. Returning `{ id: 'pa1' }` makes it proceed to
      // the `auditPageQueue.add` call we want to reject.
      findFirst: vi.fn().mockResolvedValue({ id: 'pa1' }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(1),
    },
    finding: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  },
}));

vi.mock('@jheo/core', () => ({
  runAudit: vi.fn(async () => ({ findings: [], score: { overall: 100 } })),
}));

import { makeAuditHandler } from '../src/jobs/audit-job.js';

const originalFetch = globalThis.fetch;
const fetchText = vi.fn(async () => ({ status: 200, headers: {}, text: '<html></html>' }));

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

async function setupHandler({
  auditId,
  updateManyCount,
  throwMessage,
}: {
  auditId: string;
  updateManyCount: number;
  throwMessage: string;
}) {
  const { prisma } = await import('../src/db.js');
  const queue = await import('../src/queue.js');

  (prisma.audit.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: auditId,
    projectId: 'p1',
    status: 'queued',
    configSnapshot: {},
  });
  (prisma.project.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'p1',
    rootUrl: 'https://example.com/',
    maxPages: 0,
  });
  (prisma.audit.updateMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    count: updateManyCount,
  });
  (queue.auditPageQueue.add as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
    new Error(throwMessage),
  );

  // discoverSite needs a real fetch response.
  globalThis.fetch = vi.fn(
    async () =>
      new Response('<html><body>hi</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
  ) as unknown as typeof fetch;

  return { prisma, queue, handler: makeAuditHandler({ fetchText }) };
}

describe('audit handler catch path — manual completion preservation', () => {
  it('uses a conditional updateMany that only flushes failed when the audit is still running', async () => {
    const { prisma, handler } = await setupHandler({
      auditId: 'a1',
      updateManyCount: 1,
      throwMessage: 'orchestrator boom',
    });

    await expect(
      (handler as unknown as (j: { data: { auditId: string } }) => Promise<unknown>)(
        { data: { auditId: 'a1' } },
      ),
    ).rejects.toThrow('orchestrator boom');

    const updateManyCalls = (prisma.audit.updateMany as unknown as ReturnType<typeof vi.fn>).mock
      .calls;
    expect(updateManyCalls).toHaveLength(1);
    const args = updateManyCalls[0]?.[0] as { where: Record<string, unknown>; data: Record<string, unknown> };
    // The whole point of the fix: the WHERE clause must include
    // `status: 'running'`, so a manual `UPDATE ... SET status='completed'`
    // race-inserted by an operator is *not* clobbered.
    expect(args.where).toEqual({ id: 'a1', status: 'running' });
    expect(args.data.status).toBe('failed');

    // And the unconditional `update` path must NOT be used to write
    // 'failed' (that was the 2026-07-08 bug).
    const updateCalls = (prisma.audit.update as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const flushedViaUnconditional = updateCalls.some(
      (c) => c[0]?.data?.status === 'failed',
    );
    expect(flushedViaUnconditional).toBe(false);
  });

  it('does not write failed when the audit was already moved to completed mid-flight (manual recovery)', async () => {
    const { prisma, handler } = await setupHandler({
      auditId: 'a2',
      updateManyCount: 0, // operator's manual `UPDATE` already moved the row out of 'running'
      throwMessage: 'waitUntilFinished timeout',
    });

    // The handler must still re-throw so BullMQ counts the failure for
    // retry accounting — but the DB state must be left alone.
    await expect(
      (handler as unknown as (j: { data: { auditId: string } }) => Promise<unknown>)(
        { data: { auditId: 'a2' } },
      ),
    ).rejects.toThrow('waitUntilFinished timeout');

    const updateManyCalls = (prisma.audit.updateMany as unknown as ReturnType<typeof vi.fn>).mock
      .calls;
    expect(updateManyCalls).toHaveLength(1);
    // Only the conditional updateMany was called — and it was a no-op
    // (count: 0). No `update` call to 'failed' should exist anywhere.
    const updateCalls = (prisma.audit.update as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const failedWrites = updateCalls.filter((c) => c[0]?.data?.status === 'failed');
    expect(failedWrites).toHaveLength(0);

    // Sanity: the early 'running' transition is still allowed (top
    // guard passed because the audit was 'queued' on entry).
    const runningTransitions = updateCalls.filter((c) => c[0]?.data?.status === 'running');
    expect(runningTransitions).toHaveLength(1);
  });
});
