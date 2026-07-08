import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/queue.js', () => ({
  auditQueue: { add: vi.fn() },
  auditPageQueue: { add: vi.fn() },
  auditOrchestrator: 'polling', // use polling path; Flow Producer is tested via integration
  auditPageConcurrency: 5,
}));

vi.mock('../src/db.js', () => {
  return {
    prisma: {
      audit: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
      project: { findUnique: vi.fn() },
      projectPage: {
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        upsert: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      pageAudit: {
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      finding: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    },
  };
});

vi.mock('@jheo/core', () => ({
  runAudit: vi.fn(async () => ({ findings: [], score: { overall: 100, byCategory: { seo: 100, cwv: 100, geo: 100, a11y: 100, content: 100 } } })),
}));

import { makeAuditHandler } from '../src/jobs/audit-job.js';

const fetchText = vi.fn(async () => ({ status: 200, headers: {}, text: '<html></html>' }));

describe('runProjectAuditJob polling orchestrator', () => {
  it('aggregates page scores and closes the audit with pagesAudited + pagesTotal', async () => {
    const { prisma } = await import('../src/db.js');
    (prisma.audit.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'a1', projectId: 'p1', status: 'queued', configSnapshot: {},
    });
    (prisma.project.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1', rootUrl: 'https://example.com/', maxPages: 0,
    });
    (prisma.pageAudit.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { score: { overall: 80, byCategory: { seo: 80, cwv: 80, geo: 80, a11y: 80, content: 80 } } },
      { score: { overall: 100, byCategory: { seo: 100, cwv: 100, geo: 100, a11y: 100, content: 100 } } },
    ]);
    (prisma.pageAudit.count as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(2);

    const handler = makeAuditHandler({ fetchText });
    const fakeJob = { data: { auditId: 'a1' } } as Parameters<typeof handler>[0];
    await handler(fakeJob);

    const update = (prisma.audit.update as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
    expect(update.data.status).toBe('completed');
    expect(update.data.score.pagesAudited).toBe(2);
    expect(update.data.score.overall).toBe(90);
  });
});