import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/db.js', () => ({
  prisma: {
    finding: { findMany: vi.fn() },
  },
}));

// Import after mocking
import { prisma } from '../src/db.js';
// The helper is internal; we test it via the public runPageAuditJob flow
// (a separate integration test covers the full flow). For unit, we assert
// the helper's expected behavior with a small refactor: expose it.

import { attachLineage } from '../src/jobs/page-audit-job.js';

describe('attachLineage', () => {
  it('returns previousFindingId=null when no prior head exists', async () => {
    (prisma.finding.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const findings = await attachLineage(
      [{ category: 'seo', severity: 'warning', rule: 'meta.missing', message: 'no meta', url: 'https://x.test/', evidence: {} }],
      'pa-new',
      'pp-1',
    );
    expect(findings[0]?.previousFindingId).toBeNull();
  });

  it('returns the prior head id when one exists', async () => {
    (prisma.finding.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'f-prior', url: 'https://x.test/', category: 'seo', rule: 'meta.missing' },
    ]);
    const findings = await attachLineage(
      [{ category: 'seo', severity: 'error', rule: 'meta.missing', message: 'no meta', url: 'https://x.test/', evidence: {} }],
      'pa-new',
      'pp-1',
    );
    expect(findings[0]?.previousFindingId).toBe('f-prior');
  });
});
