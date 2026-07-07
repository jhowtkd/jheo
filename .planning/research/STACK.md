# Stack Research

**Domain:** Google Search Console integration (F4 milestone) for Node.js/TypeScript monorepo
**Researched:** 2026-07-07
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `googleapis` | `173.0.0` | Official Node.js client for Search Console (`searchconsole` v1 + `webmasters` v3) | Google-maintained, typed clients for `searchAnalytics.query` and `urlInspection.index.inspect`; matches PROJECT.md decision; no native bindings (pure JS, Docker-safe) |
| `google-auth-library` | `10.9.0` | Service Account JWT auth (`JWT` client) | Official auth path for server-to-server; creates short-lived Bearer tokens from decrypted SA JSON; also bundled transitively by `googleapis@^10.2.0` but **declare explicitly** in `packages/core` for JWT construction and test doubles |
| Node.js `crypto` (existing) | — | AES-256-GCM encrypt/decrypt of SA JSON at rest | Already in `apps/api/src/crypto.ts`; no new secret-store dependency |
| BullMQ + ioredis (existing) | `5.12.0` / `5.4.1` | `gscQueue` for snapshot + inspect jobs | Matches F1–F3 worker pattern; worker `limiter` enforces JHEO's 5 req/min/project cap |
| Prisma + Postgres (existing) | `5.18.0` | `GscConnection`, `GscSnapshot` persistence | Same stack as F1–F3; encrypted credentials + snapshot rows |
| Zod (existing) | `3.23.8` | Validate SA JSON shape + API request bodies | Already used at API boundaries; validate `client_email`, `private_key`, `type: "service_account"` before encrypt |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `googleapis` → `google.searchconsole('v1')` | via `googleapis@173` | URL Inspection API | Post-publish `urlInspection.index.inspect` calls |
| `googleapis` → `google.webmasters('v3')` | via `googleapis@173` | Search Analytics API | Daily snapshot `searchAnalytics.query` (28-day window, paginated) |
| `google-auth-library` → `JWT` | `10.9.0` | Service Account token exchange | Construct from decrypted JSON `{ client_email, private_key }` with scope `webmasters.readonly` |
| `setInterval` (Node built-in) | — | Daily snapshot cron (Option A MVP) | Enqueue one `gscQueue` job per connected project; no new scheduler dep |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Vitest (existing) | Unit tests for `@jheo/core/gsc` | Mock `JWT` / `googleapis` clients or inject `fetchFn` + fake token getter |
| GCP Console | Enable API + create SA keys | One-time per deployment; not a runtime dependency |
| Search Console UI | Grant SA access per property | Manual step — API returns 403 without it |

## Dependency Placement (Integration Points)

```
packages/core/                    apps/api/
├── package.json                  ├── package.json (no new Google deps)
│   + googleapis@173              │   uses @jheo/core/gsc
│   + google-auth-library@10.9    │
├── src/gsc/                      ├── src/routes/gsc.ts        (8 REST endpoints)
│   ├── client.ts                 ├── src/jobs/gsc-job.ts      (snapshot + inspect)
│   ├── types.ts                  ├── src/queue.ts             (+ gscQueue worker)
│   ├── search-analytics.ts       ├── src/crypto.ts            (encrypt SA JSON)
│   └── url-inspection.ts         └── src/server.ts            (setInterval cron)
└── exports: "./gsc" subpath
```

**Why `googleapis` lives in `packages/core`, not `apps/api`:**
- PROJECT.md mandates a pure `@jheo/core/gsc` client with injected auth/`fetchFn`, consistent with LLM and distribution publishers.
- `apps/api` stays a thin adapter: decrypt credentials → build `JWT` → pass to core → persist results via Prisma.

**Auth injection pattern (match existing core conventions):**

```typescript
// packages/core/src/gsc/types.ts
import type { JWT } from 'google-auth-library';

export type GscAuth = Pick<JWT, 'request' | 'fetch'>; // or JWT instance

export type GscClientDeps = {
  auth: GscAuth;
  siteUrl: string; // must match GSC property format exactly
  fetchFn?: typeof fetch; // optional override for tests
};
```

```typescript
// apps/api — wire-up at job/route boundary
import { JWT } from 'google-auth-library';
import { decrypt } from '../crypto.js';

const sa = JSON.parse(decrypt(connection.encryptedCredentials, env.JHEO_SECRET_KEY));
const auth = new JWT({
  email: sa.client_email,
  key: sa.private_key,
  scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
});
await auth.authorize(); // caches access token internally
```

**API surfaces used (via `googleapis`):**

| F4 feature | Client | Method | REST endpoint |
|------------|--------|--------|---------------|
| Daily snapshot | `google.webmasters('v3')` | `searchanalytics.query` | `POST /webmasters/v3/sites/{siteUrl}/searchAnalytics/query` |
| Post-publish inspect | `google.searchconsole('v1')` | `urlInspection.index.inspect` | `POST /v1/urlInspection/index:inspect` |

**OAuth scope (single scope covers both APIs):**

| Scope | Use in F4 |
|-------|-----------|
| `https://www.googleapis.com/auth/webmasters.readonly` | Search Analytics read + URL Inspection read |

Do **not** request `https://www.googleapis.com/auth/webmasters` (read/write) — F4 has no sitemap submit or site management.

## Service Account Setup Requirements

Service Account auth is a **two-plane** setup: GCP credentials + GSC property permission. Missing either plane yields `403 User does not have sufficient permission`.

### GCP (Google Cloud Console)

1. Create or select a GCP project.
2. **Enable** the [Google Search Console API](https://console.cloud.google.com/apis/library/searchconsole.googleapis.com).
3. IAM & Admin → Service Accounts → **Create Service Account** (no GCP IAM roles required for GSC read).
4. Keys → **Add Key → JSON** → download key file.
5. Store the JSON encrypted via existing `encrypt()` — never return ciphertext or plaintext in API responses.

**Required JSON fields** (validate with Zod before encrypt):

| Field | Required | Notes |
|-------|----------|-------|
| `type` | yes | Must be `"service_account"` |
| `client_email` | yes | Shown to user for GSC user-add step |
| `private_key` | yes | PEM string for JWT signing |
| `project_id` | yes | GCP project identifier |

### Search Console (per property — manual)

1. Human owner verifies the property in Search Console first (any verification method).
2. Settings → **Users and permissions** → **Add user**.
3. Paste the SA `client_email` (e.g. `gsc-reader@project.iam.gserviceaccount.com`).
4. Permission: **Restricted** (read-only) is sufficient for F4; Full only needed if sitemap submit is added later.
5. Repeat for each project — JHEO is 1:1 `siteUrl` ↔ Project; no auto-discovery.

### `siteUrl` format (common 404/empty-data cause)

| Property type | Format example |
|---------------|----------------|
| URL-prefix | `https://www.example.com/` (trailing slash required) |
| Domain | `sc-domain:example.com` |

Must match the property string in Search Console exactly — URL-encode when passed as a path segment.

## API Quotas (Official Limits)

Source: [Search Console API Usage Limits](https://developers.google.com/webmaster-tools/limits) (HIGH confidence).

### Search Analytics

| Limit type | Per-site | Per-project | F4 impact |
|------------|----------|-------------|-----------|
| QPM | 1,200 | 40,000 | Daily snapshot = 1–N paginated queries; JHEO cap 5/min/project is far below |
| QPD | — | 30,000,000 | No concern for single-user local tool |
| Row limit per request | max 25,000 (`rowLimit`) | — | Paginate with `startRow` if needed |
| Row limit per day | 50,000 rows per search type | — | 28-day snapshot with `dimensions: [date, query, page, device, country]` may hit this on large sites; design idempotent upsert + log truncation |
| Load quota | 10-min + 1-day windows | — | Grouping by page **and** query is expensive; prefer separate overview vs detail queries |
| Data retention | 16 months | — | 28-day window is safe |

### URL Inspection

| Limit type | Per-site | Per-project | F4 impact |
|------------|----------|-------------|-----------|
| QPM | 600 | 15,000 | Post-publish best-effort: 1 inspect per publish |
| QPD | **2,000** | 10,000,000 | Hard ceiling for inspect-heavy workflows; F4's single-URL post-publish is well within |
| Index inspection quota | per-site | — | Separate from QPM; failures return quota-exceeded |

### Error handling (no new libraries)

| HTTP / error | Meaning | JHEO response |
|--------------|---------|---------------|
| `403` | SA not added to GSC property | Surface actionable message with `client_email` hint |
| `429` / `quotaExceeded` | Rate or load limit | BullMQ exponential backoff (existing `RETRY_POLICY`); respect 15-min wait for load quota |
| `404 siteUrl` | Wrong property format | Validate `siteUrl` on connection create |

Monitor usage in GCP Console → APIs → Search Console API → **Quotas** tab.

## Installation

```bash
# Add to packages/core only — apps/api inherits via workspace
pnpm --filter @jheo/core add googleapis@173.0.0 google-auth-library@10.9.0
```

Add subpath export to `packages/core/package.json`:

```json
"./gsc": {
  "types": "./dist/gsc/index.d.ts",
  "import": "./dist/gsc/index.js"
}
```

No Dockerfile changes — both packages are pure JS, Node ≥18 (project uses Node 20).

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Service Account + JWT | OAuth 2.0 user consent flow | Multi-tenant SaaS where each user connects their own GSC account; rejected for JHEO single-user local tool |
| `googleapis` official client | Raw `fetch` + `google-auth-library` JWT Bearer only | If Docker image size becomes a problem (`googleapis` ~207 MB unpacked on disk; runtime imports only load used API modules). Same auth, ~600 KB auth lib, manual request typing |
| `googleapis` official client | Community wrappers (`google-search-console-cli`, unofficial npm clients) | Never — unmaintained, no Google SLA, break on API changes |
| `setInterval` cron | BullMQ repeatable jobs | F5 candidate if cron reliability across restarts matters; F4 MVP explicitly defers |
| Encrypted JSON in Postgres | GCP Secret Manager / Vault | Adds cloud coupling; conflicts with local-first Docker deployment |
| Search Console API | Google Indexing API (`google.indexing('v3')`) | **Wrong API** — Indexing API only supports `JobPosting` and `BroadcastEvent` URL types, not general site pages |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| OAuth user-flow libraries (`passport-google-oauth20`, etc.) | Out of scope; adds browser consent + refresh-token storage | Service Account JWT |
| Google Indexing API for post-publish | Does not index arbitrary pages; different product | URL Inspection API (`searchconsole.v1.urlInspection.index.inspect`) |
| Unofficial GSC npm clients | No official support; stale types | `googleapis` |
| `gcloud` CLI in runtime container | Not needed for API calls; bloats Docker image | `google-auth-library` JWT in process |
| `node-cron` / `cron` package | F4 uses `setInterval`; no new scheduler dep | Node `setInterval` in `server.ts` |
| BullMQ repeat/cron jobs (F4) | Deferred to F5 per PROJECT.md | `setInterval` + `gscQueue.add` |
| `@google-cloud/secret-manager` | Ephemeral filesystem on Render is fine; secrets in DB encrypted | Existing `crypto.ts` + `JHEO_SECRET_KEY` |
| API keys (Testing Tools API) | GSC private data requires OAuth/SA, not API keys | Service Account JWT |
| Separate `webmasters` npm package | Deprecated; folded into `googleapis` | `google.webmasters('v3')` from `googleapis` |

## Stack Patterns by Variant

**If snapshot pulls exceed 25,000 rows/day:**
- Paginate with `startRow` increments of 25,000 until empty or 50,000/day cap.
- Split queries by `type` (`web`, `image`, etc.) only if product requires it.

**If Docker image size from `googleapis` is problematic:**
- Keep `google-auth-library` in core; move to raw REST + `fetchFn` for the two endpoints above.
- Drop `googleapis` dependency entirely (~200 MB disk savings).
- Trade-off: lose generated TypeScript types; maintain Zod response schemas manually.

**If 403 persists after SA setup:**
- Confirm SA email added under the **exact** property (domain vs URL-prefix mismatch is the #1 cause).
- Confirm Search Console API enabled in the **same** GCP project as the SA key.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `googleapis@173.0.0` | `google-auth-library@^10.2.0` | Declared dependency; pin explicit `10.9.0` for JWT |
| `googleapis@173.0.0` | Node `>=18` | Project uses Node 20.11 (Dockerfile) — compatible |
| `googleapis@173.0.0` | ESM (`"type": "module"`) | Use `import { google } from 'googleapis'` |
| `google-auth-library@10.9.0` | TypeScript 5.6 | Ships its own types; no `@types/*` needed |
| BullMQ limiter `5/min` | GSC 1,200 QPM/site | JHEO app-level throttle is conservative; safe |

## Sources

- Context7 `/websites/googleapis_dev_nodejs_googleapis` — `google.searchconsole('v1')`, service account credentials, Search Console API initialization (HIGH)
- Context7 `/googleapis/google-auth-library-nodejs` — `JWT` from service account JSON, scopes, `client.fetch()` (HIGH)
- [Search Console API Usage Limits](https://developers.google.com/webmaster-tools/limits) — QPM/QPD/load/row limits (HIGH)
- [Authorize Requests](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing) — OAuth 2.0 required; `webmasters` / `webmasters.readonly` scopes (HIGH)
- [Search Analytics query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query) — request/response shape, `rowLimit` 25,000 (HIGH)
- [API Reference](https://developers.google.com/webmaster-tools/v1/api_reference_index) — webmasters v3 + searchconsole v1 URL Inspection endpoint split (HIGH)
- [Indexing API Prerequisites](https://developers.google.com/search/apis/indexing-api/v3/prereqs) — SA must be added as GSC user/owner (HIGH)
- npm registry (`npm view googleapis version` → `173.0.0`, `google-auth-library` → `10.9.0`) — current versions as of 2026-07-07 (HIGH)
- JHEO `.planning/PROJECT.md` — F4 scope, Service Account decision, 5 req/min cap, core purity constraints (HIGH)

---
*Stack research for: F4 Google Search Console integration*
*Researched: 2026-07-07*
