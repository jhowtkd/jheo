import { afterEach, describe, expect, it, vi } from 'vitest';

// Phase 3: audit-job.ts no longer runs runAudit inline. It enqueues
// auditPageQueue jobs and waits. Force the polling path so the test does
// not need a live Redis / Flow Producer.
vi.mock('../src/queue.js', () => ({
  auditQueue: { add: vi.fn() },
  auditPageQueue: { add: vi.fn() },
  auditOrchestrator: 'polling',
  auditPageConcurrency: 5,
}));

vi.mock('../src/db.js', () => {
  const transaction = vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
  return {
    prisma: {
      audit: {
        findUnique: vi.fn(),
        update: vi.fn(),
        // The catch path uses a conditional updateMany so it does not
        // clobber a status an operator (or a concurrent worker) set during
        // an in-flight run. Default the mock to "1 row matched" so the
        // happy-path test still exercises the failure-write; tests that
        // exercise the no-clobber path override this.
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      project: { findUnique: vi.fn() },
      projectPage: {
        createMany: vi.fn(),
        updateMany: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn().mockResolvedValue([{ id: 'pp1', url: 'https://example.com/' }]),
      },
      pageAudit: {
        create: vi.fn().mockResolvedValue({ id: 'pa1' }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        update: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: 'pa1' }),
        findMany: vi.fn().mockResolvedValue([]),
        // Polling orchestrator polls `count` until done >= total. Return 1
        // to match the single persisted ProjectPage so the loop exits.
        count: vi.fn().mockResolvedValue(1),
      },
      finding: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      $transaction: transaction,
    },
  };
});

// runAudit is no longer called from the handler — the per-page worker calls
// it. Mock it for legacy callers that still import it.
vi.mock('@jheo/core', () => ({
  runAudit: vi.fn(async () => ({ findings: [], score: { overall: 100 } })),
}));

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

describe('runProjectAuditJob handler (orchestrator)', () => {
  it('enqueues one auditPageQueue job per persisted ProjectPage in the polling path', async () => {
    const { prisma } = await import('../src/db.js');
    const queue = await import('../src/queue.js');
    const { makeAuditHandler } = await import('../src/jobs/audit-job.js');

    (prisma.audit.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'a1',
      projectId: 'p1',
      status: 'queued',
      configSnapshot: {},
    });
    (prisma.project.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1',
      rootUrl: 'https://example.com/',
      maxPages: 0,
    });
    (prisma.audit.update as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});

    globalThis.fetch = vi.fn(async () =>
      new Response('<html></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    ) as unknown as typeof fetch;

    const fetchText = async (
      url: string,
      init?: { headers?: Record<string, string>; signal?: AbortSignal },
    ) => {
      const headers = { 'User-Agent': 'JHEO/0.1 (+local)', ...(init?.headers ?? {}) };
      const res = await fetch(url, { headers, signal: init?.signal });
      return {
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        text: await res.text(),
      };
    };

    const handler = makeAuditHandler({ fetchText });
    await handler({ data: { auditId: 'a1' } } as never);

    // The handler MUST close the audit, with status 'completed' even when
    // pagesAudited is 0 (the polling loop saw all pages terminal).
    const updateCalls = (prisma.audit.update as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const lastUpdate = updateCalls.at(-1)?.[0];
    expect(lastUpdate.data.status).toBe('completed');

    // One auditPageQueue.add call per persisted ProjectPage.
    expect(queue.auditPageQueue.add).toHaveBeenCalledTimes(1);
    expect(queue.auditPageQueue.add).toHaveBeenCalledWith(
      'page',
      expect.objectContaining({
        auditId: 'a1',
        projectPageId: 'pp1',
        url: 'https://example.com/',
      }),
    );
  });

  it('closes the audit with status failed when the orchestrator throws', async () => {
    const { prisma } = await import('../src/db.js');
    const queue = await import('../src/queue.js');
    const { makeAuditHandler } = await import('../src/jobs/audit-job.js');

    (prisma.audit.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'a1',
      projectId: 'p1',
      status: 'queued',
      configSnapshot: {},
    });
    (prisma.project.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1',
      rootUrl: 'https://example.com/',
      maxPages: 0,
    });
    (prisma.audit.update as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});

    // Force the polling path to throw mid-loop (e.g. DB blip during the
    // 30-minute poll). The handler's outer try/catch must flip the Audit
    // to 'failed' before rethrowing.
    (queue.auditPageQueue.add as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('boom'),
    );

    globalThis.fetch = vi.fn(async () =>
      new Response('<html></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    ) as unknown as typeof fetch;

    const fetchText = async (
      url: string,
      init?: { headers?: Record<string, string>; signal?: AbortSignal },
    ) => {
      const headers = { 'User-Agent': 'JHEO/0.1 (+local)', ...(init?.headers ?? {}) };
      const res = await fetch(url, { headers, signal: init?.signal });
      return {
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        text: await res.text(),
      };
    };

    const handler = makeAuditHandler({ fetchText });
    await expect(handler({ data: { auditId: 'a1' } } as never)).rejects.toThrow('boom');

    // The catch path uses a conditional updateMany so a manual
    // completion (or concurrent worker) cannot be clobbered with
    // 'failed'. The handler must still flush 'failed' when the audit
    // is still 'running' (the default mock returns count=1, so the
    // conditional matches and the write happens).
    const updateManyCalls = (prisma.audit.updateMany as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const lastFlush = updateManyCalls.at(-1)?.[0];
    expect(lastFlush).toBeDefined();
    expect(lastFlush.where).toEqual({ id: 'a1', status: 'running' });
    expect(lastFlush.data.status).toBe('failed');
    // The unconditional `update` path must NOT be used for the failure
    // flush (it was the bug — clobbered manual 'completed' on
    // 2026-07-08).
    const unconditionalUpdates = (prisma.audit.update as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const flushedViaUnconditional = unconditionalUpdates.some(
      (c) => c[0]?.data?.status === 'failed',
    );
    expect(flushedViaUnconditional).toBe(false);
  });
});