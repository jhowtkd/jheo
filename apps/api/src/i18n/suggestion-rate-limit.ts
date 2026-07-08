// Same shape as checkTranslateRate (F6). Shared token-bucket helper with TTL eviction.
import { createTokenBucket } from '../token-bucket.js';

const bucket = createTokenBucket({ max: 10, windowMs: 60_000 });

export function checkSuggestionRate(ip: string): { allowed: boolean; retryAfterMs: number } {
  return bucket.check(ip);
}
