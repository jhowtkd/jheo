# Phase 2 Summary: GSC Core + Snapshots

**Completed:** 2026-07-07
**Status:** Implemented

## Delivered

| Requirement | Status |
|-------------|--------|
| GSC-07 Daily snapshot pull (28-day window) | ✓ |
| GSC-08 Idempotent GscSnapshot upsert | ✓ |
| GSC-09 28-day prune on sync | ✓ |
| GSC-12 Failures set lastError, isolated queue | ✓ |
| GSC-24 Pure @jheo/core/gsc client | ✓ |
| GSC-25 Core unit tests (fetch-mock) | ✓ |

## Key Files

- `packages/core/src/gsc/` — client, queries, inspect, types
- `apps/api/prisma/migrations/20260707143000_add_gsc_snapshot/`
- `apps/api/src/jobs/gsc-job.ts` — snapshot action
- `apps/api/src/queue.ts` — `gscQueue` + worker (5 req/min limiter)
- `apps/api/src/env.ts` — `GSC_ENABLED`

## Next

Phase 3: Read APIs + manual `POST /sync`
