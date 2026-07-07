# Roadmap: JHEO F4 — Search Console Integration

## Overview

F4 enriches JHEO's audit → generate → publish loop with Google Search Console data. Users connect a Service Account per project, sync daily search analytics into local snapshots, read metrics without live Google calls, get SEO findings from low-CTR pages, and trigger best-effort URL Inspection after publish. Delivery follows API-first vertical slices: connection → core/sync → read APIs → audit/publish hooks → cron automation → UI.

## Milestone

**F4 — Search Console Integration** (Phases 1–6)

## Phases

- [ ] **Phase 1: GSC Connection** - Schema, encrypted credentials, CRUD, and connection validation
- [ ] **Phase 2: GSC Core + Snapshots** - Pure core client, BullMQ sync job, idempotent snapshot storage
- [ ] **Phase 3: GSC Read APIs + Manual Sync** - Overview/queries/pages from snapshots, POST /sync trigger
- [ ] **Phase 4: Audit Enrichment + Publish Hook** - gsc-low-ctr plugin and post-publish URL Inspection
- [ ] **Phase 5: Cron Automation** - Daily setInterval snapshot enqueue with deduplication
- [ ] **Phase 6: GSC UI** - Connection management, metrics views, and sync feedback in dashboard

## Phase Details

### Phase 1: GSC Connection
**Goal**: Users can securely connect, validate, view, and disconnect a GSC property per project
**Depends on**: Nothing (first phase)
**Requirements**: GSC-01, GSC-02, GSC-03, GSC-04, GSC-05, GSC-06
**Success Criteria** (what must be TRUE):
  1. User can upload Service Account JSON and siteUrl to connect GSC to a project
  2. System validates SA JSON shape, encrypts credentials, and never returns ciphertext in API responses
  3. Connection save tests GSC access via sites.get and surfaces actionable 403/404 errors with client_email hint
  4. User can view connection status (siteUrl, lastSyncAt, syncStatus, syncError) and disconnect without losing snapshots
  5. Decrypt failures show decrypt_error status and prompt re-upload instead of crashing
**Plans:** 1 plan

Plans:
- [ ] `01-01-PLAN.md` — GscConnection schema, gsc-config/auth, connection CRUD routes, GSC-03 error tests

### Phase 2: GSC Core + Snapshots
**Goal**: System pulls and stores daily GSC search analytics snapshots for connected projects
**Depends on**: Phase 1
**Requirements**: GSC-07, GSC-08, GSC-09, GSC-12, GSC-24, GSC-25
**Success Criteria** (what must be TRUE):
  1. packages/core/gsc provides pure searchAnalytics + urlInspection client with injected fetchFn and auth
  2. GSC core module has unit tests with fetch-mock and golden-file fixtures
  3. BullMQ gscQueue snapshot action pulls 28-day rolling window (dataState final) and upserts rows idempotently
  4. Snapshot rows older than 28 days are pruned on each successful sync
  5. GSC sync failures set connection lastError without breaking unrelated audits or publishes
**Plans**: TBD

### Phase 3: GSC Read APIs + Manual Sync
**Goal**: Users can read GSC metrics from stored snapshots and trigger manual refresh
**Depends on**: Phase 2
**Requirements**: GSC-10, GSC-13, GSC-14, GSC-15, GSC-16, GSC-17
**Success Criteria** (what must be TRUE):
  1. User can view overview metrics (clicks, impressions, CTR, avg position) for a date range from stored snapshots
  2. User can view paginated top queries and top pages sorted by clicks from stored snapshots
  3. Read endpoints never call Google live — all data served from GscSnapshot table
  4. API responses include data freshness metadata (lastSyncedAt, syncStatus, effective data-through date)
  5. User can manually trigger snapshot sync via POST /sync (rate limited 5 req/min per project)
**Plans**: TBD

### Phase 4: Audit Enrichment + Publish Hook
**Goal**: Audits surface low-CTR GSC pages and publishes trigger best-effort URL Inspection
**Depends on**: Phase 2
**Requirements**: GSC-18, GSC-19, GSC-20, GSC-21, GSC-22, GSC-23
**Success Criteria** (what must be TRUE):
  1. Audit worker injects recent GSC snapshot context via Symbol jheo.gsc.snapshot when connection exists
  2. gsc-low-ctr plugin flags pages with impressions > 100 and CTR < 2% as seo findings
  3. Audit plugin no-ops gracefully when GSC snapshot is absent or stale (audit completes normally)
  4. System enqueues URL Inspection after successful wordpress/http publish (best-effort, non-fatal)
  5. URL Inspection results are logged on publish job; agent channel publishes do not trigger inspection
**Plans**: TBD

### Phase 5: Cron Automation
**Goal**: Connected projects receive daily snapshot sync without manual intervention
**Depends on**: Phase 2
**Requirements**: GSC-11
**Success Criteria** (what must be TRUE):
  1. System runs daily snapshot sync via setInterval cron on worker startup
  2. Cron skips projects synced within the last 20 hours (job deduplication)
  3. Cron enqueues snapshot jobs only for projects with active GSC connections
**Plans**: TBD

### Phase 6: GSC UI
**Goal**: Users manage GSC connections and view metrics from the project dashboard
**Depends on**: Phases 1, 3, 5
**Requirements**: GSC-26, GSC-27, GSC-28
**Success Criteria** (what must be TRUE):
  1. User can manage GSC connection from project dashboard (upload SA JSON, siteUrl, view status)
  2. User can view GSC overview, queries, and pages metrics in project dashboard
  3. User can trigger manual sync from UI with sync status feedback
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6
(Phases 4 and 5 can parallelize after Phase 2; Phase 6 requires Phases 1, 3, and 5)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. GSC Connection | 0/? | Not started | - |
| 2. GSC Core + Snapshots | 0/? | Not started | - |
| 3. GSC Read APIs + Manual Sync | 0/? | Not started | - |
| 4. Audit Enrichment + Publish Hook | 0/? | Not started | - |
| 5. Cron Automation | 0/? | Not started | - |
| 6. GSC UI | 0/? | Not started | - |

---
*Roadmap created: 2026-07-07*
*Milestone: F4 Search Console Integration*
