import { describe, expect, it } from 'vitest';
import { buildFreshness, resolveSnapshotDateRange } from '../src/gsc-read.js';

describe('gsc-read', () => {
  it('resolveSnapshotDateRange ends 3 days before today', () => {
    const { end, dataThrough } = resolveSnapshotDateRange(28);
    const expected = new Date();
    expected.setUTCHours(0, 0, 0, 0);
    expected.setUTCDate(expected.getUTCDate() - 3);
    expect(end.getTime()).toBe(expected.getTime());
    expect(dataThrough).toBe(expected.toISOString().slice(0, 10));
  });

  it('buildFreshness includes connection sync metadata', () => {
    const lastSyncAt = new Date('2024-01-01T00:00:00.000Z');
    const freshness = buildFreshness(
      { lastSyncAt, syncStatus: 'ok', syncError: null },
      7,
    );
    expect(freshness.lastSyncedAt).toEqual(lastSyncAt);
    expect(freshness.syncStatus).toBe('ok');
    expect(freshness.days).toBe(7);
    expect(freshness.dataThrough).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
