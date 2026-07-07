# Requirements: JHEO F4 — Search Console Integration

**Defined:** 2026-07-07
**Core Value:** Users can audit a site, generate content grounded in real findings, approve it, and publish — enriched with real Google Search Console data.

## F4 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### GSC Connection

- [ ] **GSC-01**: User can connect a GSC property to a project by uploading Service Account JSON and specifying siteUrl
- [ ] **GSC-02**: System validates Service Account JSON shape and encrypts credentials at rest (never returned in API responses)
- [ ] **GSC-03**: System validates connection on save by calling GSC sites.get and surfaces actionable errors (403 SA not added, 404 wrong siteUrl)
- [ ] **GSC-04**: User can view GSC connection status (siteUrl, lastSyncAt, syncStatus, syncError, client_email hint)
- [ ] **GSC-05**: User can disconnect GSC from a project (stop sync, retain existing snapshots)
- [ ] **GSC-06**: System handles decrypt failures gracefully with decrypt_error status and re-upload prompt

### GSC Snapshots & Sync

- [ ] **GSC-07**: System pulls daily search analytics snapshots for connected projects (28-day rolling window, dataState final)
- [ ] **GSC-08**: System stores snapshot rows idempotently in GscSnapshot (compound PK: projectId, date, query, page, device, country)
- [ ] **GSC-09**: System prunes snapshot rows older than 28 days on each successful sync
- [ ] **GSC-10**: User can manually trigger snapshot sync via POST /sync (rate limited 5 req/min per project)
- [ ] **GSC-11**: System runs daily snapshot sync via setInterval cron with job deduplication (skip if synced within 20h)
- [ ] **GSC-12**: GSC sync/inspect failures set connection lastError without breaking unrelated audits or publishes

### GSC Read APIs

- [ ] **GSC-13**: User can view GSC overview metrics (clicks, impressions, CTR, avg position) for a date range from stored snapshots
- [ ] **GSC-14**: User can view top queries breakdown (sorted by clicks, paginated) from stored snapshots
- [ ] **GSC-15**: User can view top pages breakdown (sorted by clicks, paginated) from stored snapshots
- [ ] **GSC-16**: Read endpoints never call Google live — all data served from GscSnapshot table
- [ ] **GSC-17**: API responses include data freshness metadata (lastSyncedAt, syncStatus, effective data-through date)

### Audit Enrichment

- [ ] **GSC-18**: Audit worker injects recent GSC snapshot context via Symbol jheo.gsc.snapshot when connection exists
- [ ] **GSC-19**: gsc-low-ctr audit plugin flags pages with impressions > 100 and CTR < 2% as seo findings
- [ ] **GSC-20**: Audit plugin no-ops gracefully when GSC snapshot is absent or stale (audit completes normally)

### Publish Integration

- [ ] **GSC-21**: System enqueues URL Inspection after successful wordpress/http publish (best-effort, non-fatal)
- [ ] **GSC-22**: URL Inspection results are logged on publish job (no InspectionRecord table in F4)
- [ ] **GSC-23**: Agent channel publishes do not trigger URL Inspection

### Core Module

- [ ] **GSC-24**: packages/core/src/gsc provides pure GSC client (searchAnalytics + urlInspection) with injected fetchFn and auth
- [ ] **GSC-25**: GSC core module has unit tests with fetch-mock and golden-file fixtures

### GSC UI

- [ ] **GSC-26**: User can manage GSC connection from project dashboard (upload SA JSON, siteUrl, view status)
- [ ] **GSC-27**: User can view GSC overview, queries, and pages metrics in project dashboard
- [ ] **GSC-28**: User can trigger manual sync from UI with sync status feedback

## Future Requirements (F5+)

Deferred to future milestones. Tracked but not in F4 roadmap.

### GSC Advanced

- **GSC-F01**: OAuth user consent flow for multi-user SaaS
- **GSC-F02**: Multiple GSC properties per project
- **GSC-F03**: BullMQ repeatable cron jobs (replace setInterval)
- **GSC-F04**: Inspection history persisted in InspectionRecord table
- **GSC-F05**: 90-day or 16-month snapshot retention
- **GSC-F06**: Period-over-period comparison in overview API
- **GSC-F07**: Snapshot-fed generation context (top underperforming queries in prompts)
- **GSC-F08**: Auto-discover verified GSC properties via Sites API picker

## Out of Scope

Explicitly excluded for F4. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| OAuth user-flow | Service Account is official path for automated local tool; OAuth deferred to F5 |
| Multiple GSC properties per project | 1:1 with Project matches JHEO single-site model |
| Real-time GSC streaming (SSE/WebSocket) | GSC data lags 2–3 days; daily snapshots sufficient |
| Inspection history DB | Log-only in F4; 2,000 QPD quota makes history expensive |
| Batch indexing requests | URL Inspection diagnoses only; no bulk indexing API |
| BullMQ repeat cron | setInterval sufficient for F4 MVP single-worker deploy |
| Auto-discovery of GSC properties | User supplies siteUrl with validation hints |
| googleapis in packages/core | Core purity — auth in api, fetchFn REST in core |
| googleapis Indexing API | Wrong product; only JobPosting/BroadcastEvent |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (pending roadmap) | — | Pending |

**Coverage:**
- F4 requirements: 28 total
- Mapped to phases: 0
- Unmapped: 28 ⚠️

---
*Requirements defined: 2026-07-07*
*Last updated: 2026-07-07 after F4 research synthesis*
