import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db.js', () => {
  const findingFindMany = vi.fn();
  const pageAuditFindMany = vi.fn();
  const auditUpdate = vi.fn();
  return {
    prisma: {
      finding: { findMany: findingFindMany },
      pageAudit: { findMany: pageAuditFindMany },
      audit: { update: auditUpdate },
    },
  };
});

import { ensureScoreSnapshot } from '../src/services/score-backfill.js';
import { prisma } from '../src/db.js';

afterEach(() => {
  vi.clearAllMocks();
});

describe('ensureScoreSnapshot', () => {
  it('returns the existing score unchanged when it is already v2', async () => {
    const v2Score = { overall: 80, byCategory: { seo: 80 }, scoreEngineVersion: '2' };
    const result = await ensureScoreSnapshot({ id: 'a1', status: 'completed', score: v2Score });
    expect(result).toBe(v2Score);
    expect(prisma.audit.update).not.toHaveBeenCalled();
  });

  it('backfills a legacy score with v2 snapshot and recomputedAt', async () => {
    (prisma.finding.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { category: 'seo', severity: 'info', rule: 'r1', message: 'm', url: 'https://e/', selector: null, evidence: {} },
    ]);
    (prisma.pageAudit.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { status: 'completed' },
      { status: 'completed' },
      { status: 'failed' },
    ]);
    (prisma.audit.update as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await ensureScoreSnapshot({
      id: 'a1',
      status: 'completed',
      score: { overall: 100, byCategory: { seo: 100 } },
    });

    expect(prisma.audit.update).toHaveBeenCalledOnce();
    const arg = (prisma.audit.update as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.where.id).toBe('a1');
    expect(arg.data.score.scoreEngineVersion).toBe('2');
    expect(arg.data.score.recomputedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(arg.data.score.pagesAudited).toBe(2);
    expect(arg.data.score.pagesWithError).toBe(1);
    expect(arg.data.score.byCategory.seo).toBe(100);
    // Returned object is the same v2 snapshot that was persisted.
    expect(result).toEqual(arg.data.score);
  });

  it('does not backfill non-completed audits', async () => {
    const result = await ensureScoreSnapshot({
      id: 'a1',
      status: 'running',
      score: null,
    });
    expect(result).toBeNull();
    expect(prisma.audit.update).not.toHaveBeenCalled();
  });
});