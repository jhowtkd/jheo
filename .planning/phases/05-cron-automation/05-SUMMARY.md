# Phase 5 — Cron Automation

**Status:** COMPLETE  
**Requirements:** GSC-11

## Delivered

- `apps/api/src/gsc-cron.ts` — daily `setInterval`, skip if synced within 20h, deterministic BullMQ jobIds
- `apps/api/src/server.ts` — starts cron when `GSC_ENABLED`, stops on shutdown

## Tests

- `apps/api/test/gsc-cron.test.ts`
