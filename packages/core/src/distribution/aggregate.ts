import type { ReviewState } from '../types.js';
import type { PublishStatus } from './types.js';

export type AggregatePublish = { status: PublishStatus };

/**
 * Valid state transitions for the `ReviewState` lifecycle.
 * Source: F1+F2 spec §5.
 * Used by the recompute logic in `aggregateReviewState` to ensure the
 * state machine stays consistent.
 */
export const validTransitions: Record<ReviewState, ReadonlyArray<ReviewState>> = {
  draft: ['in_review', 'approved'],
  in_review: ['draft', 'approved'],
  approved: ['publishing', 'draft'],
  publishing: ['published', 'draft'],
  published: ['draft'],
};

export function aggregateReviewState(publishes: AggregatePublish[]): ReviewState {
  if (publishes.length === 0) return 'approved';
  const hasActive = publishes.some((p) => p.status === 'queued' || p.status === 'running');
  if (hasActive) return 'publishing';
  const allSucceeded = publishes.every((p) => p.status === 'completed');
  if (allSucceeded) return 'published';
  return 'approved';
}
