# Phase 4 — Audit Enrichment + Publish Hook

**Status:** COMPLETE  
**Requirements:** GSC-18, GSC-19, GSC-20, GSC-21, GSC-22, GSC-23

## Delivered

- `packages/core/src/audit/seo/gsc-low-ctr.ts` — flags pages with impressions > 100 and CTR < 2%
- `packages/core/src/gsc/snapshot-context.ts` — `GSC_SNAPSHOT` symbol, URL normalization, lookup helpers
- `apps/api/src/gsc-snapshot-context.ts` — builds page-level metrics from last 7 days of snapshots
- `apps/api/src/jobs/audit-job.ts` — injects `GSC_SNAPSHOT` when connection is ok and snapshots exist
- `apps/api/src/jobs/gsc-job.ts` — `action: 'inspect'` for URL Inspection API
- `apps/api/src/jobs/publish-job.ts` — best-effort GSC inspect enqueue after wordpress/http publish
- `apps/api/src/server.ts` — wires `gscInspectEnqueue` to `gscQueue`

## Tests

- `packages/core/test/seo/gsc-low-ctr.test.ts`
- `apps/api/test/gsc-snapshot-context.test.ts`
- `apps/api/test/jobs/gsc-job-inspect.test.ts`
- `apps/api/test/jobs/publish-job-gsc-hook.test.ts`
