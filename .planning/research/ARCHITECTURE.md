# Architecture Research

**Domain:** Google Search Console integration into JHEO monorepo (F4 milestone)
**Researched:** 2026-07-07
**Confidence:** HIGH

## Standard Architecture

### System Overview

GSC fits JHEO as a **fourth vertical slice** alongside audit, generation, and distribution — same layering, same boundaries. Pure logic and Google API shapes live in `packages/core`; credentials, queues, cron, and persistence live in `apps/api`; the SPA reads stored snapshots only.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         apps/web (Vite SPA)                              │
│  GSC connection form · overview/queries/pages charts · sync trigger       │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ REST (read snapshots / manage connection)
┌───────────────────────────────▼─────────────────────────────────────────┐
│                    apps/api (Fastify + in-process worker)                │
├─────────────────────────────────────────────────────────────────────────┤
│  routes/gsc.ts          gsc-cron.ts (setInterval)                        │
│       │                        │                                         │
│       ▼                        ▼                                         │
│  encrypt/decrypt ──► gscQueue (BullMQ) ──► jobs/gsc-job.ts              │
│       │                        │                                         │
│       │            ┌───────────┴───────────┐                             │
│       │            │ action: snapshot      │ action: inspect              │
│       │            └───────────┬───────────┘                             │
│       │                        │                                         │
│  jobs/audit-job.ts ◄── Symbol  │  jobs/publish-job.ts ──► inspect enqueue│
│  (inject snapshot ctx)         │                                         │
├────────────────────────────────┼─────────────────────────────────────────┤
│                    packages/core (@jheo/core)                            │
│  gsc/client.ts · gsc/types.ts · gsc/normalize.ts                         │
│  audit/plugins/gsc-low-ctr.ts · gsc/symbols.ts                            │
├────────────────────────────────┼─────────────────────────────────────────┤
│  Postgres (Prisma)             │  Redis (BullMQ)                         │
│  GscConnection · GscSnapshot   │  gsc queue                              │
└────────────────────────────────┴─────────────────────────────────────────┘
                                │
                                ▼
                    Google Search Console APIs
         webmasters v3 (searchAnalytics) + searchconsole v1 (urlInspection)
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `@jheo/core/gsc` | REST client shapes, request builders, row normalization, audit plugin logic | Pure TS; injected `fetchFn` + `getAccessToken()` |
| `GscConnection` (Prisma) | 1:1 project ↔ GSC property; encrypted Service Account JSON; sync metadata | Mirror `DistributionChannel` credential pattern |
| `GscSnapshot` (Prisma) | Daily search analytics rows (28-day rolling window) | Compound unique key for idempotent upsert |
| `gscQueue` + `gsc-job.ts` | Async snapshot pull and URL inspection | Same BullMQ pattern as `audit` / `publish` queues |
| `gsc-cron.ts` | Daily enqueue of snapshot jobs for active connections | `setInterval` in `server.ts` (Option A MVP) |
| `routes/gsc.ts` | Connection CRUD, manual sync trigger, overview/queries/pages reads | Fastify + Zod; never call Google from GET handlers |
| `gsc-auth.ts` (api) | JWT from decrypted SA JSON via `google-auth-library` | Stays in api; never imported by core |
| `gsc-low-ctr` plugin | Optional audit enrichment from injected snapshot | Registered in `orchestrator.ts`; reads `GSC_SNAPSHOT` symbol |
| Publish inspect hook | Best-effort post-publish URL Inspection | Non-fatal enqueue/call from `publish-job.ts` after `completed` |

## Recommended Project Structure

```
packages/core/src/
├── gsc/
│   ├── types.ts              # GscSnapshotRow, SearchAnalyticsRequest, InspectResult
│   ├── client.ts             # fetchSearchAnalytics(), inspectUrl() — injected deps
│   ├── normalize.ts          # API rows → GscSnapshot upsert payloads
│   ├── symbols.ts            # export const GSC_SNAPSHOT = Symbol('jheo.gsc.snapshot')
│   └── index.ts
├── audit/
│   ├── plugins/
│   │   └── gsc-low-ctr.ts    # impressions > 100 && ctr < 2%
│   └── orchestrator.ts       # append gsc-low-ctr to ALL_PLUGINS (or gated export)
└── index.ts                  # re-export gsc + plugin symbols

apps/api/src/
├── gsc-auth.ts               # JWT from SA JSON (google-auth-library)
├── gsc-config.ts             # Zod schemas for connection body (siteUrl, saJson)
├── gsc-cron.ts               # setInterval → enqueue snapshot jobs
├── jobs/
│   └── gsc-job.ts            # makeGscHandler({ prisma, decrypt, getToken, fetchFn })
├── routes/
│   └── gsc.ts                # 8 REST endpoints under /api/projects/:projectId/gsc/*
├── queue.ts                  # + GSC_QUEUE, gscQueue, startGscWorkers
├── jobs/audit-job.ts         # MODIFIED: load snapshot, inject Symbol on ctx
├── jobs/publish-job.ts       # MODIFIED: best-effort inspect after completed
├── server.ts                 # MODIFIED: register routes, worker, cron, shutdown
└── prisma/
    ├── schema.prisma         # + GscConnection, GscSnapshot models
    └── migrations/...        # compound PK migration

apps/api/test/
├── jobs/gsc-job.test.ts
├── routes/gsc.test.ts
└── gsc-cron.test.ts

packages/core/test/gsc/
├── client.test.ts
├── normalize.test.ts
└── gsc-low-ctr.test.ts
```

### Structure Rationale

- **`packages/core/gsc/`:** Matches `distribution/` and `audit/` — all Google semantics and audit rules are testable without Prisma, Redis, or JWT.
- **`apps/api/gsc-auth.ts`:** Auth is an infrastructure concern, same as `crypto.ts` for channel credentials. `google-auth-library` stays out of core.
- **Single `gscQueue` with `action` discriminator:** Avoids queue proliferation; snapshot and inspect share rate limiting and worker concurrency. Mirrors how one `publish` queue handles all channel types.
- **`gsc-cron.ts` as separate module:** Keeps `server.ts` boot logic readable; cron is easy to disable in tests via injection.
- **No `InspectionRecord` table:** Per PROJECT.md scope — inspect results are log-only; publish hook does not block on persistence.

## Architectural Patterns

### Pattern 1: Core Purity with Injected I/O

**What:** Core builds GSC REST requests and parses responses; api supplies `fetchFn`, token acquisition, and Prisma writes.

**When to use:** Every external call (GSC, WordPress, LLM).

**Trade-offs:** Slightly more boilerplate than calling `googleapis` directly in routes; gains unit-testability and keeps `packages/core` free of `googleapis` / `google-auth-library` weight.

**Example:**

```typescript
// packages/core/src/gsc/client.ts
export type GscDeps = {
  fetchFn: typeof fetch;
  getAccessToken: () => Promise<string>;
};

export async function querySearchAnalytics(
  deps: GscDeps,
  siteUrl: string,
  body: SearchAnalyticsRequest,
): Promise<SearchAnalyticsRow[]> {
  const token = await deps.getAccessToken();
  const encoded = encodeURIComponent(siteUrl);
  const res = await deps.fetchFn(
    `https://www.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new GscApiError(res.status, await res.text());
  return (await res.json()).rows ?? [];
}
```

```typescript
// apps/api/src/gsc-auth.ts
import { JWT } from 'google-auth-library';

export function makeTokenGetter(saJson: ServiceAccountJson) {
  const client = new JWT({
    email: saJson.client_email,
    key: saJson.private_key,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });
  return () => client.getAccessToken().then((t) => t.token ?? '');
}
```

### Pattern 2: Symbol-Injected Optional Audit Context

**What:** Worker loads GSC snapshot rows once per audit, stashes them on `AuditContext` under `GSC_SNAPSHOT` (exported from `packages/core/src/gsc/symbols.ts`). Plugins read via a getter helper; tests omit the symbol and plugin returns `[]`.

**When to use:** Cross-cutting enrichment that must not widen the public `AuditContext` interface.

**Trade-offs:** Same ergonomics as existing `derived.ts` (`PLAIN_TEXT_WORDS`, `JSONLD_BLOCKS`). **Note:** `audit-job.ts` currently uses local symbols — F4 should import shared symbols from core (align with `derived.ts` intent).

**Example:**

```typescript
// packages/core/src/gsc/symbols.ts
export const GSC_SNAPSHOT = Symbol('jheo.gsc.snapshot');

export type GscPageMetrics = { url: string; impressions: number; clicks: number; ctr: number; position: number };

export function gscSnapshotForUrl(ctx: AuditContext, url: string): GscPageMetrics | undefined {
  const map = (ctx as Record<symbol, Map<string, GscPageMetrics> | undefined>)[GSC_SNAPSHOT];
  return map?.get(normalizeUrl(url));
}
```

```typescript
// apps/api/src/jobs/audit-job.ts (addition inside page loop, before runAudit)
const snapshotMap = await loadGscSnapshotMap(prisma, project.id); // api helper
const ctx = {
  url: page.url,
  html: htmlRes.text,
  fetchText: fetchTextDedup,
  log() {},
  [GSC_SNAPSHOT]: snapshotMap, // empty Map when no connection — plugin no-ops
  // ...existing derived symbols...
};
```

### Pattern 3: Encrypted Credential Row (Channel Parity)

**What:** `GscConnection` stores `credentialsEncrypted` (AES-256-GCM via existing `crypto.ts`), `siteUrl`, `lastSyncAt`, `lastSyncStatus`, `lastSyncError`. API responses never include ciphertext or raw SA JSON.

**When to use:** Any per-project secret (channels, settings, GSC).

**Trade-offs:** Proven F3 pattern; 1:1 with `Project` via `@unique` on `projectId`.

**Example:**

```prisma
model GscConnection {
  id                   String    @id @default(cuid())
  projectId            String    @unique
  project              Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  siteUrl              String    // GSC property URL (must match verified property)
  credentialsEncrypted String
  lastSyncAt           DateTime?
  lastSyncStatus       String?   // 'ok' | 'error'
  lastSyncError        String?
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt
  snapshots            GscSnapshot[]
}

model GscSnapshot {
  projectId   String
  date        DateTime @db.Date
  query       String   @default("")
  page        String   @default("")
  device      String   @default("")
  country     String   @default("")
  clicks      Int
  impressions Int
  ctr         Float
  position    Float
  connection  GscConnection @relation(fields: [projectId], references: [projectId], onDelete: Cascade)

  @@id([projectId, date, query, page, device, country])
  @@index([projectId, date])
  @@index([projectId, page])
}
```

### Pattern 4: Snapshot-First Read API

**What:** Overview/queries/pages endpoints aggregate from `GscSnapshot` only. Manual "sync now" enqueues a job; it does not block on Google.

**When to use:** All dashboard reads; keeps UI fast and respects GSC quotas.

**Trade-offs:** Data may be up to ~24h stale (acceptable for audit enrichment); manual sync gives freshness on demand.

### Pattern 5: Best-Effort Publish Side Effect

**What:** After `recordPublishTransition(..., 'completed')` for `wordpress` / `http` channels, enqueue `{ action: 'inspect', publishId, inspectionUrl }` or fire-and-forget inspect. Failures log only; publish status stays `completed`.

**When to use:** Post-publish URL Inspection (2,000 URLs/property/day Google quota).

**Trade-offs:** No inspection history table; sufficient for F4 MVP signal in logs.

## Data Flow

### Request Flow

```
User saves GSC connection
    ↓
routes/gsc.ts → validate (gsc-config.ts) → encrypt(SA JSON) → GscConnection upsert
    ↓
(Optional) POST .../gsc/sync → gscQueue.add({ action: 'snapshot', projectId })

Daily cron (setInterval)
    ↓
gsc-cron.ts → find GscConnection where active → gscQueue.add per project

gsc-job snapshot
    ↓
decrypt credentials → makeTokenGetter → core querySearchAnalytics (paginated)
    ↓
core normalize → prisma.gscSnapshot.createMany / upsert → update lastSyncAt

User runs audit
    ↓
audit-job → load GscSnapshot (28d, keyed by page URL) → inject GSC_SNAPSHOT
    ↓
runAudit → gsc-low-ctr plugin → findings persisted

User publishes (wordpress/http)
    ↓
publish-job → completed → gscQueue.add({ action: 'inspect', ... }) [non-fatal]

User views GSC dashboard
    ↓
routes/gsc.ts → SQL aggregate on GscSnapshot → JSON (no Google call)
```

### State Management

```
GscConnection.lastSyncStatus     ← written by gsc-job on success/failure
GscSnapshot rows                 ← source of truth for reads + audit plugin
Audit findings (rule: gsc.*)     ← derived at audit time from snapshot
Publish.status                   ← never rolled back by inspect failure
```

### Key Data Flows

1. **Daily snapshot sync:** Cron → queue → Google Search Analytics API (`webmasters/v3`) → normalized rows → Postgres upsert → prune rows older than 28 days.
2. **Audit enrichment:** Latest snapshot map loaded once per audit run → per-page plugin lookup → optional `gsc.low-ctr` finding.
3. **Post-publish inspect:** Completed publish with `externalUrl` → URL Inspection API (`searchconsole/v1/urlInspection/index:inspect`) → structured log line.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Single-user local (current) | Monolith + in-process worker is correct; no changes needed |
| Small team / hosted Render | Same architecture; watch GSC quotas (5 req/min/project JHEO limit; 2k inspects/day/property Google limit) |
| Multi-tenant SaaS (out of scope) | Would need OAuth, per-tenant quota pools, separate worker process — explicitly deferred |

### Scaling Priorities

1. **First bottleneck:** Google API quotas — mitigate with BullMQ limiter on `gsc` worker (`GSC_LIMITER`: 5 req / 60s per PROJECT.md), paginate searchAnalytics with `startRow`, batch upserts in transactions.
2. **Second bottleneck:** Snapshot table size — 28-day retention + compound PK keeps rows bounded; index `(projectId, page)` for audit map load.

## Anti-Patterns

### Anti-Pattern 1: Google Calls from Route Handlers

**What people do:** `GET /gsc/overview` calls Search Console live.

**Why it's wrong:** Slow requests, quota burn, retries in HTTP layer, no offline audits.

**Do this instead:** Routes read `GscSnapshot`; only `POST .../sync` and cron enqueue jobs.

### Anti-Pattern 2: googleapis Inside packages/core

**What people do:** `import { google } from 'googleapis'` in core client.

**Why it's wrong:** Violates core purity; pulls heavy deps into shared package; harder to mock.

**Do this instead:** Core uses `fetchFn` + token injection; `google-auth-library` only in `apps/api`.

### Anti-Pattern 3: Blocking Publish on Inspection

**What people do:** Await inspect in publish handler; mark publish failed on GSC error.

**Why it's wrong:** Distribution success must not depend on indexing API availability.

**Do this instead:** Enqueue inspect after `completed`; log errors; never change publish status.

### Anti-Pattern 4: BullMQ Repeat Jobs for F4 Cron

**What people do:** `gscQueue.add(..., { repeat: { pattern: '0 3 * * *' } })` in MVP.

**Why it's wrong:** Adds Redis repeat-key complexity before it's needed; PROJECT defers to F5.

**Do this instead:** `setInterval` in `server.ts` with guarded singleton; migrate to repeat jobs in F5 if multi-instance.

### Anti-Pattern 5: OAuth User Consent Flow

**What people do:** Build OAuth redirect for "Connect Google".

**Why it's wrong:** Out of scope for single-user local tool; Service Account is the confirmed F4 path.

**Do this instead:** User pastes SA JSON + siteUrl; document GSC property user invite for SA email.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Search Analytics API (`webmasters/v3`) | Service Account JWT → POST `.../searchAnalytics/query` | Scope: `webmasters.readonly`; up to 25k rows/request; paginate with `startRow` |
| URL Inspection API (`searchconsole/v1`) | Same JWT → POST `urlInspection/index:inspect` | Hard limit 2,000 URLs/property/day; use sparingly post-publish |
| Google Cloud IAM | User-managed outside JHEO | SA must be added as Restricted user on each GSC property |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `apps/web` ↔ `routes/gsc.ts` | REST JSON | New API client methods in `apps/web/src/api.ts` |
| `routes/gsc.ts` ↔ Prisma | Sync reads/writes for connection; async enqueue for sync | Never decrypt in list endpoints |
| `gsc-job` ↔ `@jheo/core/gsc` | Function calls with injected deps | Job owns transactions + retention prune |
| `audit-job` ↔ `GscSnapshot` | Prisma read → Symbol on ctx | Graceful no-op when no connection |
| `publish-job` ↔ `gscQueue` | `gscQueue.add` after completed | Only `wordpress` + `http`; needs `externalUrl` |
| `gsc-cron` ↔ `gscQueue` | Enqueue only | Must not run overlapping snapshot for same project (jobId dedupe) |
| `orchestrator` ↔ `gsc-low-ctr` | Direct plugin call | Plugin is pure; always safe to include |

## New vs Modified Files

### New (create)

| Path | Purpose |
|------|---------|
| `packages/core/src/gsc/*` | Pure GSC client, types, normalize, symbols |
| `packages/core/src/audit/plugins/gsc-low-ctr.ts` | Audit plugin |
| `packages/core/test/gsc/*` | Core unit tests |
| `apps/api/src/gsc-auth.ts` | JWT token getter from SA JSON |
| `apps/api/src/gsc-config.ts` | Zod validation for connection payloads |
| `apps/api/src/gsc-cron.ts` | Daily `setInterval` enqueue |
| `apps/api/src/jobs/gsc-job.ts` | BullMQ handler (snapshot + inspect) |
| `apps/api/src/routes/gsc.ts` | 8 REST endpoints |
| `apps/api/test/jobs/gsc-job.test.ts` | Job tests |
| `apps/api/test/routes/gsc.test.ts` | Route tests |
| `apps/api/prisma/migrations/*_gsc_*` | Schema migration |

### Modified (extend)

| Path | Change |
|------|--------|
| `apps/api/prisma/schema.prisma` | Add `GscConnection`, `GscSnapshot`; `Project.gscConnection` relation |
| `apps/api/src/queue.ts` | `GSC_QUEUE`, `gscQueue`, `startGscWorkers`, `GscJobData` type |
| `apps/api/src/server.ts` | Register `gscRoutes`, start GSC worker + cron, close queue on shutdown |
| `apps/api/src/jobs/audit-job.ts` | Load snapshot map; inject `GSC_SNAPSHOT` on ctx |
| `apps/api/src/jobs/publish-job.ts` | Post-complete inspect enqueue (wordpress/http) |
| `packages/core/src/audit/orchestrator.ts` | Register `checkGscLowCtr` in `ALL_PLUGINS` |
| `packages/core/src/index.ts` | Export gsc module + symbols |
| `apps/api/package.json` | Add `google-auth-library` (api only) |
| `apps/web/src/api.ts` | GSC API client functions |
| `apps/web/src/pages/ProjectDashboard.tsx` (or new tab) | GSC UI section |

### Dependencies

| Package | Where | Why |
|---------|-------|-----|
| `google-auth-library` | `apps/api` | JWT from Service Account JSON |
| `googleapis` | **Optional** `apps/api` | Not required if core uses fetch REST; skip unless api wants generated types |

Core `package.json` unchanged — no new runtime deps.

## Suggested Build Order

Order respects dependency graph (schema → core → api jobs → routes → hooks → UI):

| Step | Work | Depends on | Delivers |
|------|------|------------|----------|
| 1 | Prisma models + migration | — | Persistable connection + snapshots |
| 2 | `packages/core/src/gsc` (client, types, normalize, symbols) | — | Testable GSC logic |
| 3 | `gsc-low-ctr` plugin + orchestrator registration | Step 2 | Audit rule ready (inactive until injection) |
| 4 | `gsc-config.ts` + `gsc-auth.ts` | Step 1 | Validated input + token getter |
| 5 | `gsc-job.ts` + `queue.ts` extension | Steps 1–4 | Working async sync |
| 6 | `routes/gsc.ts` (connection CRUD + sync trigger + read endpoints) | Step 5 | API complete |
| 7 | `gsc-cron.ts` + `server.ts` wiring | Step 5 | Daily automation |
| 8 | `audit-job.ts` snapshot injection | Steps 1, 2 | Audit enrichment live |
| 9 | `publish-job.ts` inspect hook | Step 5 | Post-publish inspection |
| 10 | `apps/web` GSC UI | Step 6 | End-to-end UX |

**Parallelizable:** Steps 2–3 (core) can run parallel to Step 1 (schema). Step 8 and 9 can run parallel after Step 5.

**Verification gates:**
- After Step 5: integration test with mocked `fetchFn` proves upsert idempotency
- After Step 8: audit test with injected `GSC_SNAPSHOT` produces `gsc.low-ctr` finding
- After Step 9: publish test asserts inspect enqueue on completed wordpress/http only

## REST Endpoint Sketch (integration contract)

All under `/api/projects/:projectId/gsc`:

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/connection` | Connection metadata (no secrets) |
| PUT | `/connection` | Upsert SA JSON + siteUrl (encrypt) |
| DELETE | `/connection` | Remove connection + cascade snapshots |
| POST | `/sync` | Enqueue snapshot job (202) |
| GET | `/overview` | Aggregate clicks/impressions/ctr/position from snapshots |
| GET | `/queries` | Top queries (query dimension) |
| GET | `/pages` | Top pages (page dimension) |

Exact query params (date range, limits) belong in route Zod schemas; default to stored 28-day window.

## Sources

- JHEO `.planning/PROJECT.md` — F4 scope, decisions, constraints (HIGH)
- `apps/api/src/queue.ts` — BullMQ queue/worker pattern (HIGH)
- `apps/api/src/jobs/publish-job.ts` — publish pipeline + injectable side effects (HIGH)
- `apps/api/src/jobs/audit-job.ts` — Symbol injection precedent (HIGH)
- `packages/core/src/audit/orchestrator.ts` — plugin registration (HIGH)
- `packages/core/src/audit/derived.ts` — shared Symbol pattern (HIGH)
- `apps/api/src/routes/channels.ts` + `crypto.ts` — encrypted credential pattern (HIGH)
- [Google Search Console API Reference](https://developers.google.com/webmaster-tools/v1/api_reference_index) — searchAnalytics + urlInspection endpoints (HIGH)
- Context7 `/googleapis/google-auth-library-nodejs` — JWT from service account JSON (HIGH)
- [HeySEO GSC API Guide 2026](https://heyseo.app/blog/google-search-console-api-guide) — SA must be added as GSC property user; inspect quota (MEDIUM)

---
*Architecture research for: JHEO F4 Google Search Console integration*
*Researched: 2026-07-07*
