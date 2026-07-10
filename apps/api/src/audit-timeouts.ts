/**
 * Shared deadlines for the parent audit job. Kept in a leaf module so unit
 * tests can import them without loading `queue.ts` (which opens IORedis).
 */

/** How long the parent audit handler may block waiting for page children. */
export const AUDIT_ORCHESTRATOR_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * BullMQ lock for the parent audit worker. Must exceed
 * {@link AUDIT_ORCHESTRATOR_TIMEOUT_MS}: the handler legitimately holds the
 * job while waiting for up to N page children. Default `lockDuration` is
 * 30s — under a busy event loop (this process also runs `auditPage`
 * workers) lock renewal can miss, and BullMQ fails the parent with
 * "job stalled more than allowable limit", leaving `Audit.status='running'`
 * forever because the stall path never runs the handler's `catch`.
 */
export const AUDIT_LOCK_DURATION_MS = AUDIT_ORCHESTRATOR_TIMEOUT_MS + 5 * 60 * 1000;
