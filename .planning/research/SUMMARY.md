# Project Research Summary

**Project:** JHEO — F4 Google Search Console Integration
**Domain:** Local-first SEO audit + content workflow tool integrating Google Search Console APIs
**Researched:** 2026-07-07
**Confidence:** HIGH

## Executive Summary

JHEO F4 adds Google Search Console as a fourth vertical slice alongside audit, generation, and distribution — not as a standalone dashboard. Experts build GSC integrations as **snapshot-first pipelines**: authenticate once per property, pull Search Analytics on a schedule, serve reads from local storage, and reserve live API calls for connection validation and best-effort post-publish URL Inspection. JHEO's single-user, Docker-local model maps cleanly to **Service Account JWT auth** (not OAuth), with credentials encrypted at rest using the existing F3 channel pattern.

The recommended approach extends proven JHEO patterns: pure `@jheo/core/gsc` logic with injected `fetchFn` and token acquisition, BullMQ `gscQueue` for async snapshot and inspect jobs, Prisma models for `GscConnection` + `GscSnapshot`, and Symbol-injected snapshot context for the `gsc-low-ctr` audit plugin. Daily automation uses `setInterval` cron (Option A MVP) enqueueing snapshot jobs — BullMQ repeat jobs deferred to F5. Reads (overview, queries, pages) never call Google; only sync triggers and cron do.

The dominant risks are operational, not architectural: **(1)** Service Account created in GCP but never added as a GSC property user (403 on every call), **(2)** `siteUrl` format mismatch (URL-prefix trailing slash vs `sc-domain:` prefix), and **(3)** GSC load-quota exhaustion from expensive multi-dimension 28-day queries. Mitigate with connection-test via `sites.get`, strict `siteUrl` validation, daily per-day query iteration with 5 req/min worker limiter, and non-fatal failure domains for inspect and audit enrichment.

## Key Findings

### Recommended Stack

No new infrastructure — F4 layers on existing Postgres, Redis/BullMQ, Prisma, Zod, Vitest, and AES-256-GCM crypto. Two Google libraries are the only runtime additions.

**Stack additions:**

| Addition | Version | Where | Purpose |
|----------|---------|-------|---------|
| `google-auth-library` | `10.9.0` | `apps/api` | JWT from decrypted Service Account JSON; scope `webmasters.readonly` |
| `googleapis` | `173.0.0` | Optional — `apps/api` only if generated types wanted | Official clients for `webmasters v3` + `searchconsole v1`; **not required** if core uses raw REST via `fetchFn` |
| Node `setInterval` | built-in | `apps/api/src/gsc-cron.ts` | Daily snapshot enqueue (no new scheduler dep) |

**Core technologies (unchanged):**
- **BullMQ + ioredis** — `gscQueue` with worker limiter (5 req/min/project) for snapshot + inspect actions
- **Prisma + Postgres** — `GscConnection` (encrypted SA JSON, sync metadata) + `GscSnapshot` (28-day rolling rows)
- **AES-256-GCM (`crypto.ts`)** — encrypt SA JSON at rest; same pattern as F3 channel credentials
- **Zod** — validate SA JSON shape (`type`, `client_email`, `private_key`, `project_id`) and route bodies before encrypt

**Stack decision to resolve at implementation:** STACK.md places `googleapis` in `packages/core`; ARCHITECTURE.md and PROJECT.md core-purity constraint favor `fetchFn` + injected token in core with `google-auth-library` only in `apps/api`. **Recommend ARCHITECTURE pattern** — matches existing LLM/distribution conventions, keeps core lightweight, avoids ~200 MB `googleapis` in shared package. Drop `googleapis` entirely unless api layer wants generated types.

**Do NOT use:** OAuth user-flow, Google Indexing API (wrong product — only JobPosting/BroadcastEvent), unofficial GSC npm clients, `webmasters` write scope, `node-cron`, BullMQ repeat jobs (F4), filesystem SA key files on Render.

### Expected Features

**Table stakes (users expect these — missing any makes integration feel broken):**

| Feature | Why Expected | Notes |
|---------|--------------|-------|
| Per-project GSC connection | Every GSC tool binds one property per workspace | SA JSON upload + `siteUrl` 1:1 with Project; encrypted at rest |
| Connection setup with validation | Immediate feedback credentials work | Test `sites.get` on save; distinguish 403 (SA not added) vs 404 (wrong `siteUrl`) |
| Daily search analytics sync | Industry standard automated pull | `searchanalytics.query`, 28-day window, `dataState: "final"`, idempotent upsert |
| Overview metrics API | Same four numbers as GSC Performance | clicks, impressions, CTR, avg position — from snapshots, not live Google |
| Queries breakdown API | #1 GSC question: "which keywords?" | Top-N by clicks from stored rows |
| Pages breakdown API | Pairs with JHEO multi-page audit model | Top-N pages; enables audit ↔ traffic correlation |
| Manual sync trigger | "Refresh now" after publish/fixes | `POST /sync` enqueues job; respect 5 req/min throttle |
| Data freshness indicator | Users don't trust numbers without context | `lastSyncedAt`, `lastSyncStatus`, data-through date (today − 2–3 days) |
| Graceful disconnect | Rotate credentials without orphan jobs | Delete connection; retain snapshots (MVP); stop cron enqueue |
| Non-fatal GSC failures | GSC outages must not break audits/publish | Set `lastError` on connection; audit/publish succeed without GSC |

**Should have (differentiators aligned with JHEO's audit → publish loop):**
- **`gsc-low-ctr` audit plugin** — impressions > 100 && CTR < 2% as `seo`/`warning` findings via Symbol-injected snapshot
- **Post-publish URL Inspection** — best-effort `urlInspection.index:inspect` after wordpress/http publish; log-only, non-fatal
- **Local-first SA auth** — no OAuth consent screen; fits self-hosted single-user audience
- **28-day rolling window** — right-sized for weekly audits without 16-month warehouse complexity

**Defer (v2+ / F5):**
- OAuth multi-user GSC, multiple properties per project, real-time SSE streaming
- Inspection history DB, batch indexing requests, 16-month backfill
- Page×query cross-tab on every sync, BullMQ repeatable cron, GA4 join
- Period-over-period comparison, striking-distance queries, per-page GSC tab in audit UI

### Architecture Approach

GSC is a fourth vertical slice: pure logic in `packages/core/gsc`, credentials/queues/cron/persistence in `apps/api`, SPA reads snapshots only via REST. Single `gscQueue` with `action: 'snapshot' | 'inspect'` discriminator shares rate limiting. No Google calls from GET route handlers.

**Major components:**
1. **`@jheo/core/gsc`** — request builders, row normalization, `GSC_SNAPSHOT` symbol, `gsc-low-ctr` plugin; injected `fetchFn` + `getAccessToken()`
2. **`GscConnection` + `GscSnapshot` (Prisma)** — encrypted credentials + compound-PK snapshot rows for idempotent upsert
3. **`gsc-job.ts` + `gsc-cron.ts`** — BullMQ handler (snapshot pull + inspect) + daily `setInterval` enqueue
4. **`routes/gsc.ts`** — 8 REST endpoints under `/api/projects/:projectId/gsc/*`
5. **Audit/publish hooks** — snapshot injection in `audit-job.ts`; inspect enqueue in `publish-job.ts` after `completed`

**Build order (respects dependency graph):**

| Step | Work | Delivers |
|------|------|----------|
| 1 | Prisma models + migration | Persistable connection + snapshots |
| 2 | `packages/core/src/gsc` (client, types, normalize, symbols) | Testable GSC logic |
| 3 | `gsc-low-ctr` plugin + orchestrator registration | Audit rule ready (inactive until injection) |
| 4 | `gsc-config.ts` + `gsc-auth.ts` | Validated input + JWT token getter |
| 5 | `gsc-job.ts` + `queue.ts` extension | Working async sync |
| 6 | `routes/gsc.ts` (CRUD + sync + read endpoints) | API complete |
| 7 | `gsc-cron.ts` + `server.ts` wiring | Daily automation |
| 8 | `audit-job.ts` snapshot injection | Audit enrichment live |
| 9 | `publish-job.ts` inspect hook | Post-publish inspection |
| 10 | `apps/web` GSC UI | End-to-end UX |

**Parallelizable:** Steps 1 ∥ 2–3; Steps 8 ∥ 9 (both after Step 5).

### Critical Pitfalls (Watch Out For)

1. **SA not added to GSC property** — GCP JSON alone yields 403 on every call. Surface `client_email` in connection test; call `sites.get` not just JWT validation; map to actionable UI message.
2. **`siteUrl` format mismatch** — URL-prefix requires trailing slash (`https://www.example.com/`); domain uses `sc-domain:example.com`. Validate on save; test via `sites.get`; verify publish URL falls under property before inspect.
3. **Load-quota exhaustion from expensive queries** — 28-day × `[query, page, device, country]` in one request hits load limits before QPM caps. Query **one day at a time**, paginate with `startRow` (25K rows/request), enforce 5 req/min limiter, 15-min backoff on 429.
4. **`JHEO_SECRET_KEY` rotation bricks credentials** — AES-256-GCM has no key versioning. On decrypt failure set `decrypt_error` status; prompt re-upload; never auto-rotate production key.
5. **`setInterval` cron lacks idempotency** — duplicate jobs on restart/multi-instance. Use deterministic BullMQ `jobId` (`gsc-snapshot:${projectId}:${date}`); skip if synced within 20h; enqueue only from worker process.
6. **Publish hook treated as critical path** — GSC inspect failure must never mark publish `failed`. Enqueue inspect **after** `completed` on separate queue action; log-only results.
7. **Stale/mismatched snapshot in audit plugin** — 2–3 day GSC lag + URL canonicalization differences cause false negatives. Load snapshot once per audit; normalize URLs before matching; plugin no-ops when snapshot absent/stale.

## Implications for Roadmap

Based on research, suggested F4 phase structure:

### Phase 1: GSC Connection (Schema + CRUD + Validation)
**Rationale:** Everything depends on a working, validated connection. Pitfalls 1, 2, and 4 surface here.
**Delivers:** `GscConnection` model, migration, `gsc-config.ts`, `gsc-auth.ts`, connection CRUD routes, connection test endpoint, decrypt-error handling, `client_email` surfacing
**Addresses:** Per-project connection, connection setup UX, graceful disconnect
**Avoids:** SA permission 403, siteUrl 404, silent decrypt failures

### Phase 2: GSC Snapshots (Core Client + Sync Job)
**Rationale:** Read APIs and audit plugin require stored snapshot rows. Highest implementation complexity.
**Delivers:** `packages/core/gsc/*`, `GscSnapshot` model, `gsc-job.ts` snapshot action, queue extension, idempotent upsert, 28-day prune, pagination, worker limiter
**Uses:** `google-auth-library` JWT, daily per-day query strategy, BullMQ limiter
**Avoids:** Load-quota exhaustion, incomplete pagination, missing retention

### Phase 3: GSC Read APIs + Manual Sync
**Rationale:** Unblocks UI and validates snapshot pipeline without waiting for cron.
**Delivers:** `GET /overview`, `/queries`, `/pages`; `POST /sync`; data freshness metadata in responses
**Addresses:** Overview/queries/pages APIs, manual sync trigger, data freshness indicator
**Implements:** Snapshot-first read pattern (no live Google on GET)

### Phase 4: Audit Enrichment + Publish Inspect Hook
**Rationale:** Value-differentiators that depend on working sync; can parallelize after Phase 2.
**Delivers:** `gsc-low-ctr` plugin, `GSC_SNAPSHOT` symbol injection in `audit-job.ts`, inspect enqueue in `publish-job.ts` (wordpress/http only)
**Addresses:** Audit enrichment, post-publish URL Inspection, non-fatal GSC failures
**Avoids:** Publish hook blocking, live GSC in audit path, agent-channel inspect

### Phase 5: Cron Automation
**Rationale:** Daily sync is table stakes but depends on stable job handler from Phase 2.
**Delivers:** `gsc-cron.ts`, `server.ts` wiring, job deduplication, worker-only startup guard
**Addresses:** Daily snapshot sync, setInterval cron
**Avoids:** Duplicate cron jobs, missed syncs

### Phase 6: GSC UI
**Rationale:** End-to-end UX last — API contracts stable from Phases 1–3.
**Delivers:** Connection form, overview/queries/pages views, sync trigger, health status, error messaging with `client_email` copy
**Addresses:** Connection health UX, data freshness indicator, actionable error messages

### Phase Ordering Rationale

- **Connection before sync** — no snapshot job without validated `siteUrl` and working SA permissions
- **Core + job before routes** — routes enqueue jobs; jobs call core; schema enables both
- **Read APIs before UI** — snapshot-first pattern validated independently of frontend
- **Enrichment/inspect parallelizable** — both consume snapshots/connection but don't block each other
- **Cron last among backend** — manual sync sufficient for early validation; cron adds scheduling complexity (dedupe)
- **UI last** — follows established F1–F3 pattern of API-first delivery

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Snapshots):** Exact daily query iteration strategy vs compound PK dimensions; validate against Google's all-your-data guide for load-quota-safe pulls on high-traffic properties
- **Phase 4 (Audit plugin):** URL normalization rules for matching crawled URLs to GSC `page` dimension (www, trailing slash, canonical variants)

Phases with standard patterns (skip research-phase):
- **Phase 1 (Connection):** Mirrors F3 encrypted credential pattern; well-documented SA setup
- **Phase 3 (Read APIs):** Standard SQL aggregation on stored rows
- **Phase 5 (Cron):** `setInterval` + BullMQ enqueue — established in codebase
- **Phase 6 (UI):** Follows existing project dashboard patterns

## Open Questions

1. **`googleapis` vs raw REST in core** — PROJECT.md lists `googleapis`; ARCHITECTURE recommends `fetchFn` only in core with auth in api. **Recommend raw REST** for core purity; decide during Phase 2 planning.
2. **Snapshot query shape** — Single request with all dimensions vs daily iteration with separate query/page pulls. **Recommend daily iteration** per Google load-quota guidance; confirm dimension set `[date, query, page, device, country]` doesn't exceed 50K rows/day on target sites.
3. **Connection status state machine** — Pitfalls recommend `pending_verification` / `active` / `decrypt_error`; FEATURES.md uses `lastSyncStatus`. Define explicit `status` field vs derived from `lastSyncError` during Phase 1 planning.
4. **Timezone for cron `jobId` and date boundaries** — GSC uses Pacific Time for `startDate`/`endDate`. Pick UTC or PT consistently for `jobId` dedupe and snapshot date keys.
5. **Disconnect snapshot retention** — MVP retains 28 days on disconnect; confirm no user expectation of immediate purge.
6. **High-traffic property truncation** — When 50K rows/day cap hit, log truncation vs split by device/country. Define behavior in Phase 2.
7. **`JHEO_SECRET_KEY` versioning** — F5 candidate; document irreversibility in Phase 1 UI copy.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official Google docs + npm versions verified; minor tension on `googleapis` placement resolved toward core purity |
| Features | HIGH | PROJECT.md decisions + official API semantics + competitor patterns align |
| Architecture | HIGH | Direct extension of F1–F3 patterns verified against codebase |
| Pitfalls | HIGH | Official quota docs + JHEO `crypto.ts`/job patterns; SA-not-added is well-documented community consensus |

**Overall confidence:** HIGH

### Gaps to Address

- **Core client implementation style** — Resolve `googleapis`-in-core vs `fetchFn` during Phase 2 planning (recommend latter)
- **Snapshot query strategy for large sites** — Prototype pagination + daily iteration against a high-traffic property before locking schema indexes
- **URL normalization for audit plugin** — Unit test matrix of www/slash/canonical variants during Phase 4
- **Render multi-instance cron** — Document F4 single-container assumption; F5 BullMQ repeat if scaling out

## Sources

### Primary (HIGH confidence)
- [Google Search Console API Usage Limits](https://developers.google.com/webmaster-tools/limits) — QPM/QPD/load/row limits
- [Search Analytics query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query) — request shape, pagination
- [URL Inspection inspect](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect) — post-publish inspect endpoint
- [Authorize Requests](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing) — SA auth, `webmasters.readonly` scope
- [Getting your performance data](https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data) — daily query iteration for load quotas
- Context7 `/websites/googleapis_dev_nodejs_googleapis` — client initialization
- Context7 `/googleapis/google-auth-library-nodejs` — JWT from SA JSON
- JHEO `.planning/PROJECT.md` — F4 scope and confirmed decisions
- JHEO codebase (`queue.ts`, `audit-job.ts`, `publish-job.ts`, `crypto.ts`) — established patterns

### Secondary (MEDIUM confidence)
- [Rankability GSC Integration](https://www.rankability.com/integrations/google-search-console/) — competitor sync/retention patterns
- [Nuwtonic GSC Dashboard](https://nuwtonic.com/features/gsc-performance-dashboard/) — CTR detection features
- [Better Search Console (GitHub)](https://github.com/houtini-ai/better-search-console) — local SA + audit patterns
- [HeySEO GSC API Guide 2026](https://heyseo.app/blog/google-search-console-api-guide) — SA setup, error catalog

---
*Research completed: 2026-07-07*
*Ready for roadmap: yes*
