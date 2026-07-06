import type { ReviewState } from '../types.js';
import type { PublishStatus } from './types.js';

export type AggregatePublish = { status: PublishStatus };

export function aggregateReviewState(publishes: AggregatePublish[]): ReviewState {
  if (publishes.length === 0) return 'approved';
  const hasActive = publishes.some((p) => p.status === 'queued' || p.status === 'running');
  if (hasActive) return 'publishing';
  const allSucceeded = publishes.every((p) => p.status === 'completed');
  if (allSucceeded) return 'published';
  return 'approved';
}
