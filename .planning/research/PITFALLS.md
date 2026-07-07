# Pitfalls Research

**Domain:** Adding Google Search Console integration to an existing local SEO audit/generation/distribution tool (JHEO F4)
**Researched:** 2026-07-07
**Confidence:** HIGH (official Google docs + verified against JHEO codebase patterns)

## Critical Pitfalls

### Pitfall 1: Service Account Created in GCP but Never Added to GSC Property

**What goes wrong:**
Every GSC API call returns `403 User does not have sufficient permission` even though the Service Account JSON is valid and the Search Console API is enabled in Google Cloud. Connection test endpoints fail; snapshot jobs retry until exhausted; users assume the JSON is corrupt.

**Why it happens:**
Developers treat GCP IAM as sufficient authorization. GSC permissions are **per-property**, not per Cloud project. Creating a Service Account and downloading JSON only authenticates *who* is calling — it does not grant access to any Search Console property. This is the single most common GSC integration failure across community guides and post-mortems.

**How to avoid:**
1. After uploading encrypted JSON, surface the `client_email` from the decrypted key in the connection-test response (never return the key itself).
2. Connection test should call `sites.get` for the configured `siteUrl` — not just validate JSON shape or obtain a JWT.
3. Document the manual step: GSC → Settings → Users and permissions → Add user → paste `client_email` → **Restricted** (read-only suffices for F4).
4. Store a `lastError` / `status` on `GscConnection` (`pending_verification` vs `active`) so the UI can show actionable guidance instead of a generic API error.

**Warning signs:**
- 403 on `sites.get` but JWT acquisition succeeds
- Empty `sites.list` despite property visible in the GSC UI under a personal account
- Works in dev with a developer's OAuth token but fails with Service Account in staging

**Phase to address:**
F4 Phase 1 — GSC Connection (connection CRUD + test endpoint)

---

### Pitfall 2: siteUrl Format Mismatch (404 `siteUrl not found`)

**What goes wrong:**
API returns `404 siteUrl not found` or empty results despite the property existing in the GSC dashboard. URL Inspection fails with "URL not in property" even when the page is clearly on the site.

**Why it happens:**
GSC `siteUrl` is an **opaque identifier string**, not a normalized URL. Two property types use different formats:
- **URL-prefix:** `https://www.example.com/` — protocol + host + **mandatory trailing slash**
- **Domain:** `sc-domain:example.com` — no protocol, `sc-domain:` prefix required

Common mistakes: storing `https://example.com` (no slash), `http://` when property is `https://`, `www` vs bare domain mismatch, using URL-prefix format when only a Domain property exists (or vice versa). The `inspectionUrl` must be **under** the `siteUrl` property — a publish URL on `https://example.com/blog/post` won't inspect under `https://www.example.com/`.

**How to avoid:**
1. Validate `siteUrl` at connection save: regex for `^sc-domain:[a-z0-9.-]+$` OR `^https?://.+/` (trailing slash required for URL-prefix).
2. Normalize user input defensively (auto-append trailing slash for URL-prefix; auto-prefix `sc-domain:` when user enters bare domain and property type is known) — but **store and send the exact GSC identifier**, not a re-derived guess.
3. Connection test via `sites.get(siteUrl)` confirms the format before any snapshot job runs.
4. For URL Inspection publish hook: resolve `externalUrl` from publish result and verify it falls under the configured `siteUrl` before enqueueing inspect job; log and skip (non-fatal) if not.

**Warning signs:**
- 404 on first snapshot but property visible in GSC UI
- Inspection works for homepage but fails for published article URLs (www vs non-www)
- `sites.list` returns the property with a different string than what's stored in `GscConnection.siteUrl`

**Phase to address:**
F4 Phase 1 — GSC Connection (validation + test); F4 Phase 4 — Publish hook (URL scope check)

---

### Pitfall 3: API Quota Exhaustion from Expensive Snapshot Queries

**What goes wrong:**
Snapshot sync fails with generic `quota exceeded` (HTTP 429). Retries amplify the problem. Daily cron never completes; snapshot table stays empty or partial; audit plugin has no data.

**Why it happens:**
GSC enforces **two independent limit types** on Search Analytics (per [official limits](https://developers.google.com/webmaster-tools/limits)):
1. **QPM/QPD rate limits:** 1,200 QPM per site, 40,000 QPM per project
2. **Load limits:** Query "cost" based on date range width, dimension grouping, and filters. Grouping by **both** `page` AND `query` is the most expensive. Wide date ranges cost more than single-day windows.

JHEO's F4 design (28-day window, compound PK with query+page+device+country) is inherently load-heavy. Pulling 28 days × all dimensions in one request, re-running on every manual sync, or running concurrent snapshot jobs for multiple projects on the same GCP project can hit load limits even below QPM caps. URL Inspection has a separate, tighter quota: **2,000 QPD per site**.

**How to avoid:**
1. Follow Google's recommended pattern: query **one day at a time** with `aggregationType: "byPage"` for page-level data ([all-your-data guide](https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data)).
2. Enforce the planned **5 req/min per project** client-side limiter in the GSC worker (BullMQ `limiter` on `gscQueue`).
3. Paginate with `startRow` (max 25,000 rows per request; 50,000 rows/day/property/search-type cap).
4. On 429: exponential backoff with **minimum 15-minute wait** for load-quota recovery (per Google docs).
5. Track `lastSyncAt` + `lastSyncError` on `GscConnection`; don't auto-retry snapshot more than once per day per project.
6. Keep URL Inspection on a separate job action with its own per-site daily budget counter.

**Warning signs:**
- 429 on first sync attempt for a new property (likely expensive query shape, not rate)
- 429 only during daily cron when multiple projects share one GCP Service Account project
- Snapshot succeeds for overview (no dimensions) but fails for page+query breakdown

**Phase to address:**
F4 Phase 2 — GSC Snapshots (query strategy + worker limiter); F4 Phase 5 — Cron sync (spacing)

---

### Pitfall 4: JHEO_SECRET_KEY Rotation Silently Bricks GSC Credentials

**What goes wrong:**
After `JHEO_SECRET_KEY` changes (Render redeploy with new env, `.env.local` regeneration via `ensureSecretKey`, manual rotation), all `GscConnection` encrypted JSON blobs fail decryption. GSC sync stops; connection appears "configured" in UI but every job fails with decrypt errors. Same failure affects F3 channel credentials and API key settings — but GSC is worse because the user can't see the stored JSON to re-upload.

**Why it happens:**
JHEO uses AES-256-GCM with a single derived key from `JHEO_SECRET_KEY` (`apps/api/src/crypto.ts`). There is no key versioning, no envelope encryption, and no migration path. `ensureSecretKey()` auto-generates a new key on first boot if missing — fine for local dev, catastrophic if production loses the original key. Encrypted blobs are opaque; the API correctly never returns them, so the UI shows a connected state with a broken backend.

**How to avoid:**
1. On decrypt failure, set `GscConnection.status = 'decrypt_error'` and surface a clear UI message: "Encryption key changed — re-upload Service Account JSON."
2. Never auto-rotate `JHEO_SECRET_KEY` in production; document that key loss is irreversible for all encrypted data.
3. Connection test endpoint should attempt decrypt before any GSC call — fail fast with a distinct error code (`DECRYPT_FAILED` vs `GSC_PERMISSION_DENIED`).
4. Consider storing a `credentialsFingerprint` (HMAC of `client_email`) alongside ciphertext so the UI can confirm "same SA re-uploaded" without decrypting.
5. F5 candidate: key versioning with `keyId` prefix in ciphertext blob.

**Warning signs:**
- `config decrypt/parse failed` in worker logs (same pattern as publish-job channel decrypt)
- All encrypted resources fail simultaneously after deploy
- `ensureSecretKey` ran on a fresh Render instance without persisting the key

**Phase to address:**
F4 Phase 1 — GSC Connection (decrypt error handling); F4 Phase 6 — UI (re-upload flow)

---

### Pitfall 5: setInterval Cron Lacks Idempotency and Multi-Instance Safety

**What goes wrong:**
Duplicate snapshot jobs enqueue for the same project/day (wasted quota), or no sync runs for days (stale data). After server restart, cron fires immediately alongside a backlog. Multiple API/worker processes each run their own `setInterval`, multiplying daily syncs.

**Why it happens:**
`setInterval` is in-process, not durable, and not distributed. Unlike BullMQ repeat jobs (deferred to F5), there is no Redis-backed schedule, no leader election, and no built-in "already ran today" guard. BullMQ job deduplication requires explicit `jobId` design — default auto-IDs allow duplicates.

**How to avoid:**
1. Use deterministic BullMQ `jobId`: `gsc-snapshot:${projectId}:${date}` (UTC date or PT date — pick one, document it, match GSC's PT timezone for `startDate`/`endDate`).
2. `queue.add(..., { jobId })` — BullMQ rejects duplicate jobIds while the first is active/waiting.
3. Before enqueueing, check `GscConnection.lastSyncAt` — skip if synced within last 20 hours.
4. Cron handler should **enqueue**, not call GSC directly — keeps API event loop free and inherits worker retry/backoff.
5. Guard `setInterval` startup: only start in the worker process, not in API-only mode; use a module-level `cronStarted` flag.
6. On Render with one container this is fine; document that scaling to multiple worker replicas requires F5 BullMQ repeat or a Redis distributed lock.

**Warning signs:**
- Same `projectId` + `date` rows upserted multiple times with different `syncedAt` timestamps
- Redis shows N identical `gsc-snapshot` jobs in waiting state
- `lastSyncAt` updates multiple times per calendar day

**Phase to address:**
F4 Phase 5 — Cron sync (setInterval + job dedupe); F4 Phase 2 — Snapshots (upsert idempotency)

---

### Pitfall 6: Publish Hook Treated as Critical Path

**What goes wrong:**
A GSC URL Inspection failure (quota exceeded, URL not in property, network timeout) causes publish to be marked `failed` or blocks `reviewState` aggregation. User's content is live on WordPress but JHEO shows a failed publish. Alternatively, inspection is awaited synchronously in the publish handler, adding 2–10s latency and risking publish timeout.

**Why it happens:**
Developers add GSC inspection inline at the end of `makePublishHandler` without isolating failure domains. The existing publish pipeline has strict status transitions (`queued → running → completed/failed`) and retry logic — a post-publish side effect inherits that semantics if not carefully separated.

**How to avoid:**
1. Publish handler marks `completed` **before** enqueueing GSC inspect job (confirmed F4 decision: best-effort, non-fatal).
2. GSC inspect runs as a separate `gscQueue` action (`inspect`), not inside `publishQueue`.
3. Wrap inspect enqueue in try/catch; log failure, never call `markFailed` on the publish.
4. Only trigger for `wordpress` and `http` channel types (not `agent`).
5. Persist inspect results to log only (no `InspectionRecord` table per scope) — use structured worker log with `publishId`, `inspectionUrl`, `verdict`.
6. Respect URL Inspection quota: skip inspect if daily count for project ≥ budget (e.g., 50/day soft cap well under 2,000 QPD).

**Warning signs:**
- Publish `failed` with GSC error message in `lastError`
- `reviewState` stuck at `publishing` because inspect promise rejected
- Publish latency spike correlating with GSC API response times

**Phase to address:**
F4 Phase 4 — URL Inspection publish hook

---

### Pitfall 7: Stale or Missing Snapshot Context in Audit Plugin

**What goes wrong:**
`gsc-low-ctr` plugin emits zero findings when GSC is connected (thinks there's no data), emits false positives (compares live crawl URL against snapshot page URL with different canonical), or blocks audit completion waiting for a live GSC API call.

**Why it happens:**
Three distinct failure modes when bolting GSC onto an existing audit pipeline:
1. **Staleness:** GSC data has a **2–3 day lag** ([official guidance](https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data)). A page audited today won't have yesterday's query data. Plugin thresholds (impressions > 100) may never fire for new content.
2. **URL mismatch:** Snapshot `page` dimension stores GSC's canonical URL (often trailing slash, www variant). Audit `ctx.url` is the crawled URL from `discoverSite`. String equality fails → plugin skips the row.
3. **Live API in audit path:** Calling GSC during `runAudit` couples audit latency to GSC quotas and breaks core purity. The existing pattern (`RequestsCtxKey` Symbol injection in `audit-job.ts`) injects pre-fetched data — GSC must follow the same pattern via `jheo.gsc.snapshot` Symbol.

**How to avoid:**
1. Audit job loads latest snapshot from DB **once per audit** (not per page API call) and injects via Symbol on each page's `AuditContext`.
2. Normalize URL matching: strip trailing slashes, lowercase host, optionally map via project's `rootUrl` canonicalization before joining snapshot rows to `ctx.url`.
3. Plugin returns `[]` silently when no snapshot exists or snapshot `syncedAt` > 7 days old — optionally emit an `info` finding "GSC data stale" at project level, not per-page.
4. Never call GSC API inside `packages/core` audit plugins — core reads injected snapshot only.
5. Document in finding evidence: `snapshotDate`, `dataLagDays` so users understand why a high-traffic page shows no GSC finding.
6. Use `dataState: "final"` (default) for snapshots — don't mix partial `all` state data into audit thresholds.

**Warning signs:**
- Plugin fires during manual sync test but never during audit
- Findings reference GSC data from a date range that doesn't overlap the audit run date
- Audit duration increases after GSC plugin added
- Per-page findings count varies based on whether snapshot sync ran that morning

**Phase to address:**
F4 Phase 3 — Audit enrichment (`gsc-low-ctr` plugin + audit-job injection); F4 Phase 2 — Snapshots (data shape for plugin consumption)

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `setInterval` cron instead of BullMQ repeat | Ships F4 faster, no new Redis patterns | Duplicate/missed syncs on restart and multi-instance | F4 MVP single-container deploy only |
| Single 28-day snapshot query (not daily iteration) | One API call, simple code | Load-quota failures, incomplete data past 25K rows | Never — use daily iteration from day one |
| Store raw GSC rows without retention job | Simpler schema | DB bloat past 28-day retention window | MVP if compound PK upsert replaces old dates; add purge in F5 |
| Skip connection status state machine | Faster CRUD | UI can't distinguish permission vs format vs decrypt errors | Never |
| Log-only URL Inspection results | Avoids new table | No inspect history in UI, hard to debug publish issues | Acceptable per F4 scope |
| Reuse one GCP project Service Account for all JHEO users | Simpler setup for local tool | Shared project quota across all connections | Acceptable for single-user local tool |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| GSC Search Analytics | One 28-day query with `[query, page, device, country]` dimensions | Daily queries, paginate, respect 50K rows/day cap |
| GSC URL Inspection | Inspecting live URL to verify just-published content | API inspects **indexed** version only — post-publish inspect shows pre-publish index state for hours/days |
| GSC URL Inspection | Using `webmasters` v3 endpoint | URL Inspection is `searchconsole.googleapis.com/v1/urlInspection/index:inspect` (separate from webmasters v3) |
| GSC Auth | Scope `https://www.googleapis.com/auth/webmasters` (write) | Use `webmasters.readonly` — principle of least privilege |
| GSC Auth | `GOOGLE_APPLICATION_CREDENTIALS` env var pointing to file | JHEO injects JSON from encrypted DB — no filesystem key file (Render ephemeral FS) |
| GSC siteUrl | Encoding siteUrl in path manually | Use `googleapis` client's URL encoding or `encodeURIComponent` — `https://` becomes `https%3A%2F%2F` |
| GSC Data | Expecting same-day data in snapshot | End `endDate` at today minus 2–3 days; run date-dimension probe query to find latest available day |
| GSC + Publish | Inspecting agent-channel publishes | F4 scope: wordpress/http only — agent channel has no `externalUrl` |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full dimension snapshot in one job | 429 quota errors, job timeout | Split into per-day sub-jobs; 5 req/min limiter | >1 property or >7 day backfill |
| Audit loads entire snapshot per page | Memory spike, slow audits | Load snapshot once in audit-job; index by normalized page URL | >50K snapshot rows per project |
| URL Inspection on every publish | 429 after ~50 publishes/day | Soft daily cap; queue inspect with lower priority | >2,000 inspects/day (hard GSC cap) |
| No snapshot retention purge | Postgres growth | Delete rows older than 28 days after upsert | ~months of daily sync without purge |
| Synchronous connection test on every page load | Slow dashboard | Cache connection status; test on save + daily cron only | Dashboard with GSC widget (F4 API) |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Returning decrypted Service Account JSON in API responses | Full GSC property access if intercepted | Write-only upload; connection test returns only `client_email` + status |
| Logging Service Account `private_key` on connection save | Credential leak in log aggregators | Log `client_email` and `project_id` only |
| Storing GSC JSON unencrypted "temporarily" | DB breach exposes Google credentials | Encrypt before INSERT; same `crypto.ts` as F3 channels |
| Using write scope when readonly suffices | SA compromise enables sitemap submission / site removal | `webmasters.readonly` scope only |
| Shared SA across unrelated users/projects (future) | Cross-property data access | F4 is 1:1 per project; each project has own encrypted JSON |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Generic "GSC sync failed" toast | User can't fix permission vs format vs quota | Map error codes to actionable messages with `client_email` copy button |
| Showing GSC metrics that lag 3 days without disclaimer | User thinks audit missed obvious traffic | Display `lastSyncAt` and "data current through {date}" in overview |
| Implying URL Inspection confirms indexing | User thinks publish = indexed | Label inspect result as "index status at inspect time" not "publish succeeded" |
| Requiring `sc-domain:` prefix without explanation | User enters domain, gets 404 | Input helper text with examples for both property types |
| Audit plugin silent when no GSC data | User thinks plugin is broken | Project-level info finding when GSC connected but snapshot empty/stale |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **GSC Connection:** Service Account added as GSC property user — verify `sites.get` returns 200, not just JSON parse success
- [ ] **GSC Connection:** `siteUrl` matches GSC property string exactly — verify against `sites.list` output
- [ ] **GSC Snapshots:** Daily sync is idempotent — verify duplicate cron doesn't create duplicate rows (compound PK holds)
- [ ] **GSC Snapshots:** Pagination handles >1,000 rows — verify `startRow` loop for high-traffic properties
- [ ] **GSC Snapshots:** Data freshness — verify `endDate` accounts for 2–3 day lag, not today's date
- [ ] **Publish Hook:** Inspection failure doesn't fail publish — verify publish `completed` with GSC 429
- [ ] **Publish Hook:** Only wordpress/http channels — verify agent publish doesn't enqueue inspect
- [ ] **Audit Plugin:** Uses injected snapshot, not live API — verify audit completes with GSC API unreachable
- [ ] **Audit Plugin:** URL normalization — verify `https://example.com/page` matches snapshot `https://example.com/page/`
- [ ] **Encryption:** Key rotation recovery — verify decrypt failure shows re-upload prompt, not silent empty data
- [ ] **Cron:** Worker-only startup — verify API process doesn't double-enqueue if both start workers

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| SA not added to GSC | LOW | Add `client_email` in GSC UI; trigger manual sync |
| siteUrl mismatch | LOW | List properties via `sites.list`; update `siteUrl` to exact match |
| Quota exceeded | LOW (wait) | Wait 15 min; reduce query complexity; resume daily sync |
| JHEO_SECRET_KEY rotation | MEDIUM | Re-upload Service Account JSON; re-enter channel credentials |
| Duplicate cron jobs | LOW | Clear duplicate BullMQ jobs by `jobId`; add dedupe guard |
| Publish marked failed by GSC | MEDIUM | Fix publish hook isolation; manually mark publish `completed` in DB |
| Stale snapshot in audits | LOW | Trigger manual sync; re-run audit; verify `lastSyncAt` |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| SA permission not granted | F4-1 Connection | `POST /gsc/test` returns 200 with property metadata |
| siteUrl format mismatch | F4-1 Connection | Validation rejects missing trailing slash; test catches 404 |
| API quota exhaustion | F4-2 Snapshots + F4-5 Cron | Snapshot completes for 28-day backfill without 429; limiter logs show spacing |
| Encryption key rotation | F4-1 Connection + F4-6 UI | Simulated wrong key returns `decrypt_error` status |
| Cron idempotency | F4-5 Cron | Two cron ticks same day → one BullMQ job; compound PK no dup rows |
| Publish hook failure domain | F4-4 Inspect hook | Publish `completed` when inspect job fails; inspect failure in worker log only |
| Snapshot staleness in audit | F4-2 Snapshots + F4-3 Audit plugin | Audit with 7-day-old snapshot emits stale warning; URL normalization unit tests pass |

## Sources

- [Google Search Console API — Usage Limits](https://developers.google.com/webmaster-tools/limits) — HIGH confidence (official)
- [Search Analytics: query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query) — HIGH confidence (official)
- [Getting your performance data (all-your-data)](https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data) — HIGH confidence (official)
- [Query your search analytics data](https://developers.google.com/webmaster-tools/v1/how-tos/search_analytics) — HIGH confidence (official)
- [URL Inspection: inspect](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect) — HIGH confidence (official)
- [Authorize Requests](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing) — HIGH confidence (official)
- [googleapis Node.js client](https://googleapis.dev/nodejs/googleapis/latest/Searchconsole.html) — HIGH confidence (Context7)
- [google-auth-library JWT](https://github.com/googleapis/google-auth-library-nodejs) — HIGH confidence (Context7)
- JHEO `apps/api/src/crypto.ts`, `audit-job.ts`, `publish-job.ts`, `queue.ts` — HIGH confidence (codebase)
- JHEO `.planning/PROJECT.md` F4 decisions — HIGH confidence (project spec)
- Community: Service Account GSC user setup guides — MEDIUM confidence (consistent across multiple sources; one dissenting report of UI rejection flagged as edge case)

---
*Pitfalls research for: JHEO F4 — Google Search Console Integration*
*Researched: 2026-07-07*
