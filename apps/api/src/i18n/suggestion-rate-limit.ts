// Same shape as checkTranslateRate (F6). Filled in detail in Task 8.
const buckets = new Map<string, { tokens: number; last: number }>();
const MAX = 10;
const WINDOW_MS = 60_000;

export function checkSuggestionRate(ip: string): { allowed: boolean; retryAfterMs: number } {
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
