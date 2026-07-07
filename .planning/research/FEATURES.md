# Feature Research

**Domain:** Google Search Console integration for local SEO audit + content workflow tool
**Researched:** 2026-07-07
**Confidence:** HIGH (official Google API docs + JHEO PROJECT.md decisions + competitor patterns)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist when a tool claims "Search Console integration." Missing these makes the integration feel broken or cosmetic.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Per-project GSC connection** | Every GSC tool binds one property to one site/workspace; users expect setup inside the project they audit | MEDIUM | Service Account JSON upload + `siteUrl` (1:1 with Project). User must add SA email as Restricted user in GSC Settings → Users. Mirrors F3 channel credential pattern (encrypted at rest, never returned in API). |
| **Connection setup UX with validation** | Users need immediate feedback that credentials work and property format is correct | MEDIUM | On save: validate JSON shape, test `sites.get` or lightweight `searchanalytics.query`, surface `403` (SA not added to property) vs `404` (wrong `siteUrl` format — trailing `/` for URL-prefix, `sc-domain:` for domain properties). Show last sync status + error message. |
| **Daily search analytics sync** | Industry standard is automated background pull; manual-only feels like a CSV exporter | HIGH | `searchanalytics.query` over rolling 28-day window. Data finalized ~2–3 days behind (use `dataState: "final"` for stable snapshots; document lag in UI). Idempotent upsert into `GscSnapshot` by `(projectId, date, query, page, device, country)`. |
| **Overview metrics API** | Users expect clicks, impressions, CTR, avg position totals — same four numbers as GSC Performance report | LOW | Read from stored snapshots, not live GSC on every page load. Aggregate across date range with period totals. Depends on snapshots. |
| **Queries breakdown API** | "Which keywords drive traffic?" is the #1 GSC question | LOW | Top-N queries sorted by clicks (matches API default). Paginate in DB, not per-request to Google. Filter by date range, device, country from snapshot dimensions. |
| **Pages breakdown API** | "Which URLs perform?" pairs with JHEO's multi-page audit model | LOW | Top-N pages from snapshot rows grouped by `page` dimension. Enables correlating audit findings with real traffic URLs. |
| **Manual sync trigger** | Users expect "Refresh now" after publishing or fixing meta tags | LOW | `POST /sync` enqueues snapshot job. Show queue position / in-progress state. Respect self-imposed 5 req/min per project throttle. |
| **Data freshness indicator** | Without "data through [date]" users don't trust the numbers | LOW | Display `lastSyncedAt`, `lastSyncStatus`, and effective data end date (typically today − 3 days for finalized data). Competitors (Rankability, TopRankerTools) all surface this. |
| **Graceful disconnect** | Users must rotate credentials or stop syncing without orphan jobs | LOW | Delete connection → stop cron enqueue for project, retain or purge snapshots per user choice (MVP: retain 28 days, stop new pulls). |
| **Non-fatal GSC failures** | GSC outages or quota errors must not break audits or publishes | LOW | Snapshot/inspect failures set connection `lastError`, do not fail unrelated jobs. Audit runs without GSC if no snapshot; publish succeeds even if inspect fails. |

### Differentiators (Competitive Advantage)

Features that align with JHEO's core value — audit → generate → publish — and go beyond "GSC dashboard in another tab."

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Audit enrichment via `gsc-low-ctr` plugin** | Connects real search performance to on-page SEO findings; competitors bolt GSC onto dashboards, JHEO bolts it into audits | MEDIUM | Optional plugin reads Symbol-injected `jheo.gsc.snapshot`. Flags pages with impressions > 100 and CTR < 2% as `seo` / `warning` findings with evidence `{ impressions, ctr, query }`. Only runs when snapshot exists + GSC connected. |
| **Post-publish URL Inspection hook** | Closes the loop: publish content → check if Google sees it — unique in audit+publish tools | MEDIUM | Best-effort `urlInspection.index:inspect` after successful wordpress/http publish. Log indexing state, canonical, last crawl, mobile usability to publish job log. Non-fatal; no InspectionRecord table (F4 scope). Agent channel excluded (bundle export, not live URL). |
| **Snapshot-fed generation context (future-ready)** | Grounds content rewrites in actual query performance, not just HTML findings | LOW (F4 prep) | F4 stores query/page rows; F5+ can inject top underperforming queries into generation prompts. F4 architecture (Symbol injection, pure `@jheo/core/gsc`) enables this without rework. |
| **Local-first, no OAuth lock-in** | Service Account per project fits single-user Docker tool; no Google consent screen, no token refresh | LOW | Deliberate tradeoff vs SaaS competitors (Rankability, Nuwtonic use OAuth). Differentiator for self-hosted audience, not for multi-tenant SaaS. |
| **28-day rolling window tuned for audit cadence** | Right-sized storage for weekly audits without competing on 16-month warehouse features | LOW | Smaller than competitors' 16–24 month retention but sufficient for low-CTR detection and trend sparklines. Prune rows older than 28 days on each sync. |
| **Unified project context** | GSC property ↔ audit root URL ↔ publish channels in one project | MEDIUM | 1:1 property mapping avoids agency-style multi-property complexity while matching how JHEO users work (one site per project). |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems for JHEO's scope, architecture, or Google's API constraints.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **OAuth user consent flow** | "Sign in with Google" feels modern; required for multi-user SaaS | Needs browser redirect, token refresh, per-user property lists; conflicts with single-user local Docker model | Service Account per project (official path for automation). Defer OAuth to a hypothetical multi-tenant fork. |
| **Multiple GSC properties per project** | Agencies manage many sites | Explodes UI, cron, and quota surface; JHEO projects are 1:1 with a site | One `GscConnection` per `Project`. Create another project for another property. |
| **Real-time GSC streaming (SSE/WebSocket)** | Feels responsive | GSC data updates daily with 2–3 day lag; streaming creates false freshness expectations | Daily snapshot + manual sync + freshness badge. |
| **Persisted inspection history** | Track index status over time | 2,000 inspects/day quota burns fast; storage/schema complexity for marginal value in MVP | Log inspect result on publish job only. F5+ could sample key URLs weekly if needed. |
| **Batch "request indexing" after publish** | Users want instant Google indexing | URL Inspection API diagnoses only — it does not submit URLs for indexing at scale. No bulk indexing API exists. | Best-effort inspect + recommend sitemap/internal linking in finding message. Rely on normal crawl discovery. |
| **Live URL indexability test pre-publish** | "Will Google index this draft?" | API inspects indexed version only, not arbitrary unpublished HTML | Run on-page SEO audit pre-publish; inspect post-publish URL after live. |
| **Auto-discover verified GSC properties** | Saves typing `siteUrl` | Requires Sites API call + UI picker; adds OAuth-like complexity for little gain in single-property-per-project model | User supplies `siteUrl` with inline format hints and validation. |
| **Full 16-month data warehouse** | Competitors store beyond GSC UI limits | High pagination cost (25K rows/request), storage growth, load-quota risk on page×query dimensions | 28-day window with daily `[query, page, device, country, date]` pulls. Deep historical analysis is out of scope. |
| **Page × query cross-tab on every sync** | Richest SEO analysis | Most expensive Search Analytics query type per Google load quotas; blows daily load budget | Sync query and page dimensions separately (2 API calls). Cross-analysis in DB if needed. |
| **BullMQ repeatable cron jobs (F4)** | "More correct" than setInterval | Extra moving parts for single-user local deploy with one worker | `setInterval` daily enqueue (Option A). Promote to BullMQ repeat in F5 if multi-instance. |

## Feature Dependencies

```
[F1 Project + Audit Pipeline]
    └──requires──> [Project CRUD, audit worker, Finding model]
                       └──enhanced by──> [gsc-low-ctr audit plugin]

[F3 Publish Pipeline]
    └──triggers (best-effort)──> [Post-publish URL Inspection]
                                      └──requires──> [GSC Connection]

[GSC Connection]
    └──requires──> [F1 Project]
    └──enables──> [Daily Snapshot Sync]
                      └──requires──> [BullMQ gscQueue + encrypted SA JSON]
                      └──feeds──> [Overview / Queries / Pages API]
                      └──feeds──> [gsc-low-ctr plugin via Symbol snapshot]

[Manual Sync Trigger]
    └──requires──> [GSC Connection]

[28-day Retention Prune]
    └──requires──> [GscSnapshot table]
    └──runs on──> [each successful snapshot job]

[Audit Enrichment]
    └──requires──> [GscSnapshot with page-level rows]
    └──conflicts with──> [Audit without GSC] (graceful: plugin no-ops)

[Post-publish Inspect]
    └──requires──> [F3 publish completed + wordpress/http channel]
    └──conflicts with──> [Agent channel inspect] (skip: no live URL)
```

### Dependency Notes

- **GSC Connection requires F1 Project:** Connection is a child of `Project`; no global GSC account. Reuse F3's AES-256-GCM encryption pattern for SA JSON.
- **Daily Snapshot requires GSC Connection:** Cron skips projects without active connection or with `syncEnabled: false`.
- **Overview/Queries/Pages APIs require Snapshots:** Never call Google on dashboard reads; all UI reads from Postgres. Keeps UI fast and avoids quota burn.
- **gsc-low-ctr enhances F1 Audits:** Worker injects latest snapshot into `AuditContext` via `Symbol.for('jheo.gsc.snapshot')`. Plugin registered optionally in `ALL_PLUGINS` or a GSC-extended plugin list. Audit completes normally if symbol absent.
- **Post-publish Inspect requires F3 Publish:** Hook fires in publish job after `status: completed`, only for `wordpress` and `http` channel types. Uses published URL from publish response.
- **Rate limit (5 req/min) applies to sync only:** Self-imposed guard below Google's 1,200 QPM per-site limit. URL Inspection has separate 2,000/day quota — one inspect per publish is negligible.

## MVP Definition

### Launch With (v1) — F4 Milestone

Minimum to validate "GSC makes JHEO audits and publish loop smarter."

- [ ] **GSC Connection CRUD** — SA JSON upload, `siteUrl`, encrypt/store, validate on save, disconnect
- [ ] **Daily snapshot sync** — 28-day rolling `searchanalytics.query` with pagination, idempotent upsert, 28-day prune
- [ ] **Manual sync trigger** — User-initiated refresh via API
- [ ] **Read APIs: overview, queries, pages** — From snapshots with date range params
- [ ] **setInterval daily cron** — Enqueue snapshot jobs for all connected projects
- [ ] **Post-publish URL Inspection** — Best-effort, log-only, wordpress/http only
- [ ] **gsc-low-ctr audit plugin** — impressions > 100 && CTR < 2%, optional when snapshot present
- [ ] **Connection health UX** — `lastSyncedAt`, `lastSyncStatus`, `lastError`, data-through date

### Add After Validation (v1.x)

Features to add once core sync + enrichment prove useful.

- [ ] **Period-over-period comparison** — Week vs week deltas on overview (trigger: users ask "did my fix work?")
- [ ] **Striking-distance queries** — Position 5–20 with high impressions (trigger: generation prompt enrichment in F5)
- [ ] **Sync progress UI** — Row counts, pagination progress for large sites (trigger: sync timeouts reported)
- [ ] **Per-page GSC tab on audit results** — Show query/page stats for audited URL (trigger: UI research in F4.1)
- [ ] **BullMQ repeatable cron** — Replace setInterval when running multiple worker instances (trigger: Render scale-out)

### Future Consideration (v2+)

Defer until product-market fit beyond single-user local tool.

- [ ] **OAuth multi-user GSC** — Only if JHEO becomes multi-tenant SaaS
- [ ] **16-month historical backfill** — Storage + quota cost; competes with dedicated GSC dashboards
- [ ] **Inspection history + alerts** — Indexed → not-indexed transitions, email/Slack
- [ ] **Sitemaps API integration** — Submit sitemaps post-publish (separate from inspect)
- [ ] **Cannibalization detection** — Multiple pages per query (needs page×query dimension storage)
- [ ] **GA4 join** — Cross-reference clicks with on-site behavior

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| GSC Connection + validation | HIGH | MEDIUM | P1 |
| Daily snapshot sync (28-day) | HIGH | HIGH | P1 |
| Overview/queries/pages read APIs | HIGH | LOW | P1 |
| Manual sync trigger | MEDIUM | LOW | P1 |
| gsc-low-ctr audit plugin | HIGH | MEDIUM | P1 |
| Post-publish URL Inspection | MEDIUM | MEDIUM | P1 |
| Data freshness indicator | MEDIUM | LOW | P1 |
| setInterval daily cron | MEDIUM | LOW | P1 |
| 28-day retention prune | MEDIUM | LOW | P1 |
| 5 req/min sync throttle | LOW | LOW | P1 |
| Period comparison | MEDIUM | MEDIUM | P2 |
| Striking-distance findings | MEDIUM | MEDIUM | P2 |
| Per-page GSC in audit UI | MEDIUM | MEDIUM | P2 |
| Inspection history DB | LOW | HIGH | P3 |
| OAuth flow | LOW (for JHEO) | HIGH | P3 |
| 16-month backfill | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for F4 launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Rankability / Nuwtonic | Better Search Console (local) | JHEO F4 Approach |
|---------|------------------------|-------------------------------|------------------|
| Auth | OAuth, multi-property | Service Account JSON | Service Account per project (encrypted) |
| Sync cadence | Daily automatic | On-demand + scheduled | Daily cron + manual trigger |
| Data retention | 16+ months stored | User-controlled SQLite | 28 days in Postgres |
| Low CTR detection | Built-in alerts, scatter plots | AI-driven audit prompts | `gsc-low-ctr` audit finding |
| URL Inspection | Not primary | Via AI questions | Post-publish best-effort hook |
| Audit integration | Separate SEO audit product | Claude audits GSC data | GSC findings inside existing 6-category audit |
| Publish loop | None | None | Inspect after wordpress/http publish |
| Rate limiting | Opaque (managed SaaS) | Full pagination, no row cap | 5 req/min self-throttle + pagination |

## Expected Behavior Reference

How each F4 feature should behave in production, based on Google API semantics and industry patterns.

### Connection Setup UX

1. User opens Project → Search Console settings.
2. Pastes Service Account JSON + enters `siteUrl` exactly as shown in GSC (URL-prefix with trailing `/` or `sc-domain:example.com`).
3. On save: API validates JSON, encrypts, stores `GscConnection`, runs test query.
4. Success: show green status + SA email reminder ("add this email in GSC → Settings → Users").
5. Failure: actionable error (`403` → permissions, `404` → siteUrl format).

### Daily Sync

1. Cron fires once per day (e.g., 02:00 UTC).
2. For each connected project: enqueue `gscQueue` snapshot job.
3. Job queries last 28 days with dimensions `[date, query, page, device, country]` — paginate with `startRow` until exhausted (25K rows/call max).
4. Upsert rows; delete snapshots older than 28 days.
5. Update `lastSyncedAt`, `lastSyncStatus: success|error`, `lastError` on failure.
6. Re-sync recent 3 days on each run to capture finalized data (GSC retroactively adjusts).

### Overview / Queries / Pages API

- **Overview:** `SUM(clicks)`, `SUM(impressions)`, `AVG(ctr)`, `AVG(position)` for date range.
- **Queries:** `GROUP BY query`, order by clicks DESC, limit/offset.
- **Pages:** `GROUP BY page`, order by clicks DESC, limit/offset.
- All reads from `GscSnapshot`; response includes `dataThrough` date.

### Post-Publish Inspect

1. Publish job completes successfully for wordpress/http.
2. If project has active GSC connection: enqueue inspect job (or inline call with timeout).
3. `POST urlInspection/index:inspect` with `inspectionUrl` = published URL, `siteUrl` = connection's property.
4. Log `indexStatusResult`, `lastCrawlTime`, `googleCanonical`, `mobileUsability` to job log.
5. On quota/error: log warning, do not change publish status.

### Audit Plugin Enrichment

1. Audit worker loads latest snapshot summary for project (or per-page slice).
2. Injects via `ctx[Symbol.for('jheo.gsc.snapshot')]`.
3. `gsc-low-ctr` iterates page-level rows; for each page matching audit URL (or site-wide in multi-page audit), emits finding if impressions > 100 && ctr < 0.02.
4. Finding: `{ category: 'seo', severity: 'warning', rule: 'gsc-low-ctr', message: '...', url, evidence: { impressions, ctr, topQuery } }`.

### Rate Limits

| Limit | Google Official | JHEO F4 |
|-------|-----------------|---------|
| Search Analytics QPM | 1,200 per site | Self-throttle 5 req/min during sync |
| Search Analytics rows | 25,000 per request | Paginate with `startRow` |
| URL Inspection QPD | 2,000 per site | 1 per publish (negligible) |
| URL Inspection QPM | 600 per site | No burst; sequential per publish |
| Load quota | Expensive: page×query, long ranges | 28-day window; separate query/page pulls if needed |

### 28-Day Retention

- **Why 28 days:** Matches default GSC UI range, sufficient for low-CTR detection and WoW comparison, bounds storage on local Postgres.
- **Prune:** `DELETE FROM GscSnapshot WHERE date < NOW() - INTERVAL '28 days'` after each successful sync.
- **Not a substitute for GSC:** Users needing 16-month history keep using GSC UI or export; JHEO uses GSC as operational signal, not data warehouse.

## Sources

- [Google Search Console API — Search Analytics query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query) — HIGH
- [Google Search Console API — URL Inspection inspect](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect) — HIGH
- [Google Search Console API — Usage Limits](https://developers.google.com/webmaster-tools/limits) — HIGH
- [JHEO PROJECT.md](/.planning/PROJECT.md) — F4 scope and confirmed decisions — HIGH
- [Rankability GSC Integration](https://www.rankability.com/integrations/google-search-console/) — competitor patterns — MEDIUM
- [Nuwtonic GSC Dashboard](https://nuwtonic.com/features/gsc-performance-dashboard/) — CTR/lost-demand features — MEDIUM
- [Better Search Console (GitHub)](https://github.com/houtini-ai/better-search-console) — local SA + audit patterns — MEDIUM
- [HeySEO GSC API Guide 2026](https://heyseo.app/blog/google-search-console-api-guide) — SA setup, error catalog — MEDIUM

---
*Feature research for: JHEO F4 — Google Search Console Integration*
*Researched: 2026-07-07*
