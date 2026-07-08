/**
 * Shared in-process token bucket with idle TTL eviction.
 * Used by translate/suggestion limiters and the opt-in Fastify route limiter.
 */
export type TokenBucket = { tokens: number; last: number };

export type RateCheck = { allowed: boolean; retryAfterMs: number };

export function createTokenBucket(opts: {
  max: number;
  windowMs: number;
  /** Hard cap on distinct keys; oldest idle entries are dropped. Default 10_000. */
  maxKeys?: number;
  /** Drop entries idle longer than this. Default 2× windowMs. */
  idleTtlMs?: number;
}) {
  const buckets = new Map<string, TokenBucket>();
  const maxKeys = opts.maxKeys ?? 10_000;
  const idleTtlMs = opts.idleTtlMs ?? opts.windowMs * 2;

  function evict(now: number): void {
    for (const [key, b] of buckets) {
      if (now - b.last > idleTtlMs) buckets.delete(key);
    }
    while (buckets.size > maxKeys) {
      const oldest = buckets.keys().next().value;
      if (oldest === undefined) break;
      buckets.delete(oldest);
    }
  }

  function check(key: string, now = Date.now()): RateCheck {
    evict(now);
    const b = buckets.get(key) ?? { tokens: opts.max, last: now };
    const elapsed = now - b.last;
    const refill = (elapsed / opts.windowMs) * opts.max;
    b.tokens = Math.min(opts.max, b.tokens + refill);
    b.last = now;
    if (b.tokens < 1) {
      buckets.set(key, b);
      const retryAfterMs = Math.ceil(((1 - b.tokens) / opts.max) * opts.windowMs);
      return { allowed: false, retryAfterMs };
    }
    b.tokens -= 1;
    buckets.set(key, b);
    return { allowed: true, retryAfterMs: 0 };
  }

  return {
    check,
    size: () => buckets.size,
    /** Test helper */
    _reset: () => buckets.clear(),
  };
}
