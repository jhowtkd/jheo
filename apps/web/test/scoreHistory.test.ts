import { describe, expect, it } from 'vitest';
import { scoreHistoryFromAudits } from '../src/lib/scoreHistory.js';
import type { Audit } from '../src/api.js';

const make = (overrides: Partial<Audit> & { id: string }): Audit => ({
  projectId: 'p1',
  status: 'completed',
  startedAt: '2026-01-01T00:00:00Z',
  finishedAt: '2026-01-01T00:01:00Z',
  score: { overall: 80, byCategory: { seo: 80 } },
  ...overrides,
});

describe('scoreHistoryFromAudits', () => {
  it('returns empty history and null previous when no completed audits', () => {
    const out = scoreHistoryFromAudits([]);
    expect(out.history).toEqual([]);
    expect(out.previousOverall).toBeNull();
  });

  it('excludes non-completed and null-overall audits', () => {
    const out = scoreHistoryFromAudits([
      make({ id: 'a1', status: 'running' }),
      make({ id: 'a2', score: null }),
      make({ id: 'a3', score: { overall: 50, byCategory: {} } }),
    ]);
    expect(out.history).toEqual([50]);
    expect(out.previousOverall).toBeNull();
  });

  it('orders history oldest → newest and caps at 5', () => {
    const audits = [1, 2, 3, 4, 5, 6, 7].map((i) =>
      make({
        id: `a${i}`,
        finishedAt: `2026-01-0${i}T00:00:00Z`,
        score: { overall: i * 10, byCategory: {} },
      }),
    );
    const out = scoreHistoryFromAudits(audits);
    expect(out.history).toEqual([30, 40, 50, 60, 70]);
    expect(out.previousOverall).toBe(60);
  });

  it('picks the second-most-recent as previousOverall', () => {
    const out = scoreHistoryFromAudits([
      make({ id: 'a1', finishedAt: '2026-01-01T00:00:00Z', score: { overall: 60, byCategory: {} } }),
      make({ id: 'a2', finishedAt: '2026-01-02T00:00:00Z', score: { overall: 80, byCategory: {} } }),
    ]);
    expect(out.history).toEqual([60, 80]);
    expect(out.previousOverall).toBe(60);
  });
});