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
  const auditFindUnique = vi.fn();
  const auditUpdate = vi.fn();
  const projectFindUnique = vi.fn();
  const findingCreate = vi.fn();
  const transaction = vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
  return {
    prisma: {
      audit: { findUnique: auditFindUnique, update: auditUpdate },
      project: { findUnique: projectFindUnique },
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
      finding: { create: findingCreate, createMany: vi.fn() },
      $transaction: transaction,
    },
  };
});

vi.mock('@jheo/core', () => ({
  runAudit: vi.fn(async () => ({ findings: [], score: { overall: 100 } })),
}));

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

describe('runProjectAuditJob handler — page job data', () => {
  it('enqueues auditPageQueue jobs with the discovered pages (caller controls url/projectPageId)', async () => {
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

    // The handler must enqueue exactly one job per persisted ProjectPage,
    // carrying pageAuditId (looked up from queued PageAudit rows) so the
    // worker can stamp findings on completion.
    expect(queue.auditPageQueue.add).toHaveBeenCalledTimes(1);
    const call = (queue.auditPageQueue.add as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('page');
    expect(call[1]).toEqual(
      expect.objectContaining({
        auditId: 'a1',
        projectPageId: 'pp1',
        url: 'https://example.com/',
        pageAuditId: 'pa1',
      }),
    );
  });
});