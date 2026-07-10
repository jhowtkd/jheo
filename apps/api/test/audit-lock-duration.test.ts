import { describe, expect, it } from 'vitest';
import {
  AUDIT_LOCK_DURATION_MS,
  AUDIT_ORCHESTRATOR_TIMEOUT_MS,
} from '../src/audit-timeouts.js';

describe('audit worker lock duration', () => {
  it('exceeds the orchestrator wait so BullMQ does not stall the parent job', () => {
    // Regression: parent audit jobs failed with
    // "job stalled more than allowable limit" while blocked in
    // waitUntilFinished / DB polling — default lockDuration is 30s.
    expect(AUDIT_ORCHESTRATOR_TIMEOUT_MS).toBe(30 * 60 * 1000);
    expect(AUDIT_LOCK_DURATION_MS).toBeGreaterThan(AUDIT_ORCHESTRATOR_TIMEOUT_MS);
  });
});
