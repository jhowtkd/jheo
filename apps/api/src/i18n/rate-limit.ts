/**
 * Per-IP token bucket for `/api/translate`. Distinct from the global
 * request-burst limiter in `server.ts` because that one is sized for
 * general traffic (20 burst / 5/sec refill), which is too generous for an
 * LLM-backed route. 10 requests/min/IP is generous for batched UI use.
 */
import { createTokenBucket } from '../token-bucket.js';

const bucket = createTokenBucket({ max: 10, windowMs: 60_000 });

export function checkTranslateRate(ip: string): { allowed: boolean; retryAfterMs: number } {
  return bucket.check(ip);
}
