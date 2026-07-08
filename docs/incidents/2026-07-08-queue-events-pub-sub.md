# Incident — 2026-07-08: Flow Producer `QueueEvents` singleton loses pub/sub under burst

{{ status: resolved }}
{{ resolved_in: commit fixing QueueEvents lifecycle (see "Fix" section below) }}
{{ project: JHEO }}
{{ component: apps/api — audit-job.ts flow orchestrator }}
{{ severity: P1 (audit stuck, manual data fix required) }}

## What happened

A 500-page audit of `cenbrap.edu.br` (project `cmrc0p08a001bktp35js3hyct`) was
triggered at 11:48 BRT. The handler fanned out 500 `auditPage` child jobs via
the Flow Producer and called `group.job.waitUntilFinished(events, 30*60_000)`.

498 of 500 children completed successfully (17,307 findings stamped), but
`waitUntilFinished` never resolved. The audit stayed in `status='running'` for
6+ minutes with `audit.active=0, audit.wait=0, auditPage.active=0,
auditPage.wait=0` — i.e. no work in flight, the parent was simply waiting for
a pub/sub event that never came. The 30-minute timeout was the only thing
that would eventually unblock it.

## Root cause

`audit-job.ts:34-41` (pre-fix) created a single module-level `QueueEvents`
singleton and reused it across every audit:

```ts
let _auditPageQueueEvents: QueueEvents | undefined;
function getAuditPageQueueEvents(): QueueEvents {
  if (!_auditPageQueueEvents) {
    _auditPageQueueEvents = new QueueEvents('auditPage', {
      connection: { host: REDIS_HOST, port: REDIS_PORT },
    });
  }
  return _auditPageQueueEvents;
}
```

Two distinct failure modes compounded:

1. **Default `maxRetriesPerRequest: 20`** on the QueueEvents' ioredis client.
   When 500 children completed in rapid succession, the burst of pub/sub
   events pushed the ioredis stream parser past its error budget. After 20
   consecutive failed commands ioredis disconnects permanently — the client
   does **not** auto-reconnect past that. The `PUBSUB CHANNELS` query
   returning empty during the incident is the smoking gun: the subscription
   was gone.

2. **No reinit path** for the singleton. Even if ioredis had reconnected
   cleanly, there was no listener on the connection's `close` event to
   detect a dead subscription and rebuild the `QueueEvents`. The stale
   instance kept being passed to `waitUntilFinished` indefinitely.

The first one is what actually killed this audit; the second one means the
bug would have persisted even after a Redis blip, not just under burst load.

## Fix

`apps/api/src/jobs/audit-job.ts`:

- Removed the module-level `_auditPageQueueEvents` singleton and
  `getAuditPageQueueEvents()`.
- Introduced `withAuditPageQueueEvents(fn)` helper that creates a fresh
  `QueueEvents` per call, scopes it to the callback, and closes it in a
  `finally` block (which swallows a rejecting `close()` so cleanup never
  masks the original error).
- The QueueEvents' connection now uses the same options as the main worker
  (`maxRetriesPerRequest: null, enableOfflineQueue: false,
  connectTimeout: 10_000`) — ioredis keeps trying to reconnect through
  transient blips instead of giving up after 20 failed commands.
- `runFlowOrchestrator` calls `withAuditPageQueueEvents((qe) =>
  group.job.waitUntilFinished(qe, 30 * 60 * 1000))`. Each audit gets a
  clean subscriber; any transient blip is naturally contained; the next
  audit starts with a fresh ioredis client and pub/sub subscription.

### Regression coverage

`apps/api/test/audit-job-queueevents.test.ts` (5 cases):

- A fresh `QueueEvents` is constructed per call (no module-level reuse)
- The instance is `close()`d after the callback resolves
- The instance is `close()`d even when the callback throws
- A rejecting `close()` is swallowed — user-callback errors still propagate
  cleanly
- Connection options match the main worker (`maxRetriesPerRequest: null`,
  `enableOfflineQueue: false`, `connectTimeout: 10_000`)

## Recovery (for the cenbrap audit, before the fix landed)

The worker zombie exited cleanly via the 30-minute timeout in
`waitUntilFinished`, but the existing idempotency guard at
`audit-job.ts:149-150` only fires on **function entry** — it does not
protect the catch path:

```ts
if (audit.status === 'completed' || audit.status === 'failed') return;
```

The audit itself was manually completed via a single SQL `UPDATE` that
mirrored the score-aggregation logic in `runProjectAuditJob` (498 pages
audited, 2 failed at fetch time, scores averaged across categories). The
SQL landed ~6 minutes after the worker went stuck. The worker zombie
finished its timeout ~25 minutes later, the catch block ran, and an
unconditional `prisma.audit.update` overwrote the manual `'completed'`
with `'failed'`. Findings (17,307 rows) were preserved — only the audit
status column was clobbered.

{{ status: superseded — the catch-path regression was fixed in a follow-up
commit (see "Catch-path follow-up" below). The QueueEvents pub/sub fix
described in the section above landed first; the catch-path fix landed
second. }}

## Why the previous fixes didn't catch this

The two most recent api fixes targeted orthogonal bugs:

- `fix(api): bail on FlowProducer parent jobs lacking pageAuditId` — caught
  parent jobs that lacked the `pageAuditId` plumbing. Would have surfaced
  in a much earlier failure (the Flow Producer add itself rejects).
- `fix(api): handle IPv6 '::' compression in URL guard ipToBigInt` — URL
  guard, not relevant to pub/sub.

Neither touches the `QueueEvents` lifecycle. This incident is the third
distinct failure mode in the audit pipeline's queue plumbing. Worth keeping
an eye on Flow Producer retry behaviour and the page-audit worker's own
listener state in future audits.

## What we learned

- ioredis pub/sub connections are not the same as the worker's blocking
  command connection, but they need the same retry posture. The default
  `maxRetriesPerRequest: 20` is a footgun for long-lived pub/sub
  subscribers.
- Singletons that hold pub/sub state across many "logical operations" are
  fragile. A scoped-per-operation resource (created in `with*`, closed in
  `finally`) is more honest about its lifetime and fails smaller when the
  underlying transport does.
- The `idempotency guard` pattern paid for itself again: it let the worker
  zombie exit cleanly even after we'd manually completed the audit, with
  zero risk of clobbering real data. Keep that guard. **But** the guard
  only fires on function entry — see "Catch-path follow-up" below for
  the catch-block clobbering bug it did *not* protect against.

## Catch-path follow-up (second fix)

The QueueEvents lifecycle fix above made the worker exit cleanly via the
30-minute timeout in `waitUntilFinished` for any future stuck audit. But
when the existing cenbrap audit hit that timeout on 2026-07-08, the
handler's catch block ran an unconditional
`prisma.audit.update({ where: { id }, data: { status: 'failed' } })` and
overwrote the `'completed'` we had manually set ~25 minutes earlier.
Findings were preserved, but the audit status was clobbered.

### Fix

`apps/api/src/jobs/audit-job.ts` — catch block now uses a conditional
`updateMany` so a manual SQL `UPDATE` (or a concurrent worker's retry
that already set a terminal state) cannot be clobbered:

```ts
} catch (err) {
  await prisma.audit.updateMany({
    where: { id: audit.id, status: 'running' },
    data: { status: 'failed', finishedAt: new Date() },
  });
  throw err;
}
```

If the row is no longer `'running'` (operator moved it to `'completed'`,
or `'cancelled'`, or another worker set it to `'failed'`), the conditional
match returns `{ count: 0 }` and the catch is a no-op. The handler still
re-throws so BullMQ accounts for the failure.

### Regression coverage

- `apps/api/test/audit-job-cache.test.ts` — updated the existing
  "closes the audit with status failed when the orchestrator throws"
  test to assert the catch uses `updateMany` (not `update`) with
  `where: { id, status: 'running' }`, and that no unconditional
  `update` to `'failed'` happens anywhere.
- `apps/api/test/audit-job-catch-clobber.test.ts` (new, 2 cases) — the
  scenario that bit us: simulate an operator's manual `UPDATE` mid-flight
  by mocking `updateMany` to return `{ count: 0 }`, force the
  orchestrator to throw, and verify no `'failed'` write happened.

### Open follow-ups (not in this fix)

- The handler's `if (!project) { ... update to 'failed' }` early-return
  and the `status: 'running'` transition are still unconditional. Same
  class of race applies (manual SQL between read and write). The right
  fix is the same `updateMany` pattern with
  `where: { id, status: { in: ['queued'] } }`. Out of scope for this
  incident; file as a separate ticket.
- The top guard checks only `'completed'` and `'failed'`, not
  `'cancelled'`. A user who cancels a `'queued'` audit may still see a
  worker pick it up and reset it to `'running'`. Same `updateMany`
  treatment in the 'running' transition would cover it.
