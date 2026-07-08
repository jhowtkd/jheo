import { describe, it, expect } from 'vitest';
import { checkTranslateRate } from '../src/i18n/rate-limit.js';

describe('checkTranslateRate', () => {
  it('allows up to 10 requests in a window', () => {
    const ip = `test-${Math.random()}`;
    for (let i = 0; i < 10; i++) {
      expect(checkTranslateRate(ip).allowed).toBe(true);
    }
  });

  it('denies the 11th request and reports retryAfter', () => {
    const ip = `test-${Math.random()}`;
    for (let i = 0; i < 10; i++) checkTranslateRate(ip);
    const out = checkTranslateRate(ip);
    expect(out.allowed).toBe(false);
    expect(out.retryAfterMs).toBeGreaterThan(0);
  });
});
