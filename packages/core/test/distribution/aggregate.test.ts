import { describe, expect, it } from 'vitest';
import { aggregateReviewState } from '../../src/distribution/aggregate.js';

describe('distribution/aggregate', () => {
  it('returns approved when no publishes', () => {
    expect(aggregateReviewState([])).toBe('approved');
  });
  it('returns publishing when any are queued', () => {
    expect(aggregateReviewState([{ status: 'completed' }, { status: 'queued' }])).toBe('publishing');
  });
  it('returns publishing when any are running', () => {
    expect(aggregateReviewState([{ status: 'completed' }, { status: 'running' }])).toBe('publishing');
  });
  it('returns published when all are completed', () => {
    expect(aggregateReviewState([{ status: 'completed' }, { status: 'completed' }])).toBe('published');
  });
  it('returns approved when some failed (operator can retry)', () => {
    expect(aggregateReviewState([{ status: 'completed' }, { status: 'failed' }])).toBe('approved');
  });
  it('returns approved when all cancelled', () => {
    expect(aggregateReviewState([{ status: 'cancelled' }, { status: 'cancelled' }])).toBe('approved');
  });
});
