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
      audit: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
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
      finding: {
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    },
  };
});

vi.mock('@jheo/core', async () => {
  const actual = await vi.importActual<typeof import('@jheo/core')>('@jheo/core');
  return {
    ...actual,
    runAudit: vi.fn(async () => ({
      findings: [],
      score: { overall: 100, byCategory: { seo: 100, cwv: 100, geo: 100, a11y: 100, content: 100 } },
    })),
  };
});

import { makeAuditHandler, completeAuditFromPageScores } from '../src/jobs/audit-job.js';

const fetchText = vi.fn(async () => ({ status: 200, headers: {}, text: '<html></html>' }));

describe('runProjectAuditJob polling orchestrator', () => {
  it('rolls up findings into a v2 score snapshot on completion', async () => {
    const { prisma } = await import('../src/db.js');
    (prisma.audit.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'a1', projectId: 'p1', status: 'queued', configSnapshot: {},
    });
    (prisma.project.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1', rootUrl: 'https://example.com/', maxPages: 0,
    });
    (prisma.pageAudit.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { status: 'completed', score: { overall: 80 } },
      { status: 'completed', score: { overall: 100 } },
    ]);
    (prisma.pageAudit.count as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    (prisma.finding.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { category: 'seo', severity: 'info', rule: 'r1', message: 'm', url: 'https://e/', selector: null, evidence: {} },
    ]);

    const handler = makeAuditHandler({ fetchText });
    const fakeJob = { data: { auditId: 'a1' } } as Parameters<typeof handler>[0];
    await handler(fakeJob);

    // Completion path uses updateMany, not update. Look there for the snapshot.
    const completion = (prisma.audit.updateMany as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
    expect(completion.data.status).toBe('completed');
    expect(completion.data.score.pagesAudited).toBe(2);
    expect(completion.data.score.scoreEngineVersion).toBe('2');
    // info-only finding in seo → seo present at 100
    expect(completion.data.score.byCategory.seo).toBe(100);
  });
});

describe('completeAuditFromPageScores v2 snapshot', () => {
  it('writes scoreEngineVersion and pagesWithError', async () => {
    const { prisma } = await import('../src/db.js');
    (prisma.finding.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.pageAudit.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { status: 'completed' },
      { status: 'completed' },
      { status: 'failed' },
    ]);
    (prisma.pageAudit.count as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (prisma.audit.updateMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    const result = await completeAuditFromPageScores('a1', { pagesTotal: 3 });
    expect(result).toBe(true);
    const update = (prisma.audit.updateMany as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
    expect(update.data.score.scoreEngineVersion).toBe('2');
    expect(update.data.score.pagesWithError).toBe(1);
    expect(update.data.score.pagesAudited).toBe(2);
    expect(update.data.score.pagesTotal).toBe(3);
  });
});