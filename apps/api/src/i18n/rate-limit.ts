/**
 * Per-IP token bucket for `/api/translate`. Distinct from the global
 * request-burst limiter in `server.ts` because that one is sized for
 * general traffic (20 burst / 5/sec refill), which is too generous for an
 * LLM-backed route. 10 requests/min/IP is generous for batched UI use.
 */
const buckets = new Map<string, { tokens: number; last: number }>();
const MAX = 10;
const WINDOW_MS = 60_000;

export function checkTranslateRate(ip: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const b = buckets.get(ip) ?? { tokens: MAX, last: now };
  const elapsed = now - b.last;
  const refill = (elapsed / WINDOW_MS) * MAX;
  b.tokens = Math.min(MAX, b.tokens + refill);
  b.last = now;
  if (b.tokens < 1) {
    buckets.set(ip, b);
    const retryAfterMs = Math.ceil(((1 - b.tokens) / MAX) * WINDOW_MS);
    return { allowed: false, retryAfterMs };
  }
  b.tokens -= 1;
  buckets.set(ip, b);
  return { allowed: true, retryAfterMs: 0 };
}
