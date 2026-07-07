# F5 — Site Mapping & Multi-Page Audit

**Date:** 2026-07-07
**Status:** Draft
**Milestone:** F5
**Author:** jhowtkd
**Predecessor:** F1–F3 (shipped), F-Hardening (shipped), F4 (cancelled — see §7)

---

## 1. Problem

JHEO today runs a single `Audit` per project against the project's `rootUrl`.
Each project, regardless of size, gets audited as one page. Tools like Semrush
and HReFS, by contrast, map the whole domain (sitemap + internal-link crawl),
audit every discovered URL, present aggregate health, and let users re-audit
individual pages on demand. To compete, JHEO needs the same shape: a project
becomes a *domain* (a set of pages), not a *URL*.

There is also significant WIP in the working tree (`site-discovery.ts`,
`ProjectPage` migration, `audit-job.ts` refactor, `Project` accepting
`domain`, `ProjectDashboard` rendering `pages[]`, two updated test files) that
implements Phase 1 of this milestone but is uncommitted and unvalidated. Phase 1
of F5 is to land that WIP, end to end.

## 2. Goals

- A user creates a project by entering a domain and gets a complete map of
  every page the system can discover.
- Every page in the map is audited; the project score is the aggregate.
- A user can see aggregate health (overall, by category) and per-page status
  (last audited, error, etc.) on the project dashboard.
- A user can re-audit a single page and see what changed since the last
  audit (new, fixed, regression).
- A large audit (hundreds of pages) does not block the worker and survives a
  restart; progress is observable while it runs.
- An audit can be cancelled mid-run.

## 3. Non-Goals

- OAuth user-flow, multi-tenant SaaS, team accounts, auth layer — F1 invariant
- Hard cap on `maxPages` — the user controls this via `Project.maxPages`; the
  default is `0` (no cap, run to completion)
- Schedule / cron for periodic audits — F5 is run-on-demand; cron is F5+
- Cross-project re-use of `ProjectPage` (a URL belongs to exactly one project)
- Cross-project re-use of `Finding` lineage (a finding lineage is scoped to
  one `ProjectPage`)
- OAuth GSC, persisted URL-inspection history, BullMQ repeat jobs — F4 (cancelled)
- Audit of pages outside the project's `rootUrl` origin (no cross-origin crawl)
- Real-time push of progress over WebSocket/SSE — Phase 3 uses HTTP polling

## 4. Domain Model

### 4.1 Schema changes

```prisma
model Project {
  // ...existing fields
  maxPages Int @default(0)   // 0 = no cap; >0 = cap
}

model ProjectPage {
  // existing (from WIP)
  id            String     @id @default(cuid())
  projectId     String
  project       Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  url           String
  discoveredVia String     // 'root' | 'sitemap' | 'crawl'
  lastAuditedAt DateTime?
  createdAt     DateTime   @default(now())
  pageAudits    PageAudit[]

  @@unique([projectId, url])
  @@index([projectId])
}

model PageAudit {
  id            String      @id @default(cuid())
  auditId       String?     // null = standalone re-audit
  audit         Audit?      @relation(fields: [auditId], references: [id], onDelete: Cascade)
  projectPageId String
  projectPage   ProjectPage @relation(fields: [projectPageId], references: [id], onDelete: Cascade)
  status        String      // 'queued' | 'running' | 'completed' | 'failed' | 'skipped'
  score         Json?       // {overall: number, byCategory: Record<string, number|null>}
  errorMessage  String?
  startedAt     DateTime?
  finishedAt    DateTime?
  createdAt     DateTime    @default(now())
  findings      Finding[]

  @@index([auditId])
  @@index([projectPageId])
  @@index([status])
}

model Finding {
  // ...existing fields
  pageAuditId       String     // now NOT NULL (see §4.2 migration)
  pageAudit         PageAudit  @relation(fields: [pageAuditId], references: [id], onDelete: Cascade)
  previousFindingId String?    // self-FK for lineage
  previousFinding   Finding?   @relation("FindingLineage", fields: [previousFindingId], references: [id])
  nextFindings      Finding[]  @relation("FindingLineage")

  @@index([pageAuditId])
  // existing indexes preserved
}

model Audit {
  // ...existing fields
  pageAudits  PageAudit[]
  // score.pagesTotal: Int added (pagesAudited is from WIP)
}
```

### 4.2 Migration strategy (data backfill)

`Finding.pageAuditId` is added as NOT NULL, but existing rows have no
`PageAudit`. Backfill:

1. For every `Audit` row that has `Finding`s, create one synthetic
   `ProjectPage` with `url = 'synthetic://audit/<auditId>'` and
   `discoveredVia = 'root'`.
2. Create one `PageAudit` for that synthetic page:
   `auditId = <auditId>, projectPageId = <synthetic.id>, status = 'completed',
   finishedAt = <audit.finishedAt ?? audit.createdAt>, score = <audit.score>`.
3. Re-link all `Finding`s of that `Audit` to the new `PageAudit`.
4. After backfill, `pageAuditId` becomes NOT NULL.

Synthetic pages are not returned by `GET /api/projects/:id/pages` (filter:
`url NOT LIKE 'synthetic://%'`). They are visible only via the
`PageAudit`/`Finding` join for historical audit detail.

### 4.3 Decision: `discoveredVia` stays a String

The project does not use Prisma `enum` anywhere; we follow the existing
pattern. Valid values: `'root' | 'sitemap' | 'crawl'`. Documented in the
`site-discovery.ts` source.

### 4.4 Decision: `lastAuditedAt` is updated on every successful `PageAudit`

Whenever a `PageAudit` transitions to `status = 'completed'`, the corresponding
`ProjectPage.lastAuditedAt` is set to `finishedAt`. This is the single
authoritative source of "last successfully audited" for the UI.

## 5. Architecture

### 5.1 Queues

| Queue | Existing? | Phase | Purpose |
|-------|-----------|-------|---------|
| `auditQueue` | yes | modified Phase 1+3 | `runProjectAuditJob`: discovery → fan-out → close Audit |
| `auditPageQueue` | **new** | Phase 3 | `runPageAuditJob`: one job per page, runs in parallel |
| `generateQueue` | yes | unchanged | F2 generation |
| `publishQueue` | yes | unchanged | F3 publishing |

`auditPageQueue` is configured with `concurrency: 5` (env
`JHEO_AUDIT_PAGE_CONCURRENCY`, default `5`).

### 5.2 Orchestrator (Phase 3)

`runProjectAuditJob` uses BullMQ Flow Producer (`FlowProducer.add({queueName, name, data, children})`) to enqueue one child job per page and wait via
`group.job.waitUntilFinished(events, timeout)`. If Flow Producer proves
flaky in production, the documented fallback is polling: every 2s,
`PageAudit.count({where: {auditId, status: {in: ['completed', 'failed', 'skipped']}}})` until it equals `pagesTotal` or a 30-minute deadline elapses.

### 5.3 Idempotency

`runPageAuditJob` (parented) — at job start:

```ts
const existing = await prisma.pageAudit.findFirst({
  where: { auditId, projectPageId, status: 'completed' },
});
if (existing) return; // already done
```

`runPageAuditJob` (standalone, `auditId === null`) — at job start:

```ts
const running = await prisma.pageAudit.findFirst({
  where: { projectPageId, status: { in: ['queued', 'running'] } },
});
if (running) return; // conflict surfaced as 409 at HTTP layer
```

### 5.4 Cancellation

`DELETE /api/audits/:id` sets `Audit.status = 'cancelled'`. The check is at
two points:

- `runProjectAuditJob` start: bail if `audit.status === 'cancelled'`.
- `runPageAuditJob` start: if `auditId` is set, re-read the parent `Audit`;
  bail if `'cancelled'`. (Standalone `PageAudit`s are not cancelable in F5.)

Each cancelled `PageAudit` is marked `status = 'skipped'` by the worker when
it bails. The `runProjectAuditJob` then aggregates normally, marking the
parent `Audit` `completed` with whatever subset ran.

### 5.5 Discovery (`apps/api/src/site-discovery.ts`)

The WIP file is correct and is adopted as-is with one semantic change:
`maxPages = 0` means **no cap** (the current code uses `maxPages = 500`
default which is changed to `0`). The `while` loops become
`while (queue.length)` with no `< maxPages` upper bound on `found.size`
when `maxPages === 0`.

Sitemap cap (`seenSitemaps.size < 50`) is a safety against pathological
sitemap chains and is preserved as a hard constant, not driven by
`maxPages`.

### 5.6 Endpoints (all phases)

| Method | Path | Phase | Notes |
|--------|------|-------|-------|
| `POST /api/projects` | | 1 | (WIP) accepts `{name, domain}` or `{name, rootUrl}` |
| `GET /api/projects` | | 1 | unchanged |
| `GET /api/projects/:id` | | 1 | (WIP) includes `pages[]` (excluding synthetic) |
| `GET /api/projects/:id/pages` | | 2 | `?limit=50&offset=0&filter=not_audited\|with_error\|discovered_via:sitemap\|crawl\|root` |
| `GET /api/projects/:id/health` | | 2 | `{overall, byCategory, pagesAudited, pagesTotal, pagesWithError, lastAuditAt}` |
| `POST /api/audits` | | 1, modified 3 | contract unchanged; Phase 1 runs sequentially, Phase 3 fans out to `auditPageQueue` |
| `GET /api/audits/:id` | | 1 | unchanged contract; `score.pagesTotal` added in Phase 3 |
| `GET /api/audits/:id/progress` | | 3 | `{status, pagesCompleted, pagesTotal, currentPages: string[]}` (HTTP polling) |
| `DELETE /api/audits/:id` | | 3 | sets `status='cancelled'`; 409 if already terminal |
| `POST /api/pages/:id/audit` | | 4 | standalone re-audit; 404 if page not found; 409 if another re-audit is queued/running for the same page |
| `GET /api/page-audits/:id` | | 4 | detail + findings with computed `diff` (see §6.4) |

**Cross-project check (all `ProjectPage`-keyed routes):** the page must
belong to a `Project` owned by the same tenant. F1 invariant: single-tenant,
so the check reduces to "the page exists". The new Phase 4 endpoints use
the flat form (`/api/pages/:id/audit`, `/api/page-audits/:id`) — the page
is fetched and a cross-project check is done at the route level
(`assertPageInProject(pageId, requesterProjectId)`) only when the
caller's project is unambiguous from another context. In F5, the flat form
is sufficient because no caller has a competing `ProjectPage` id from
another project in scope. If multi-tenant is ever introduced, F5 routes
must be re-keyed under `/api/projects/:projectId/pages/:pageId/...`.

**Caching headers** (matches F1):
- `GET /api/projects` → `Cache-Control: private, max-age=15`
- `GET /api/projects/:id` → `Cache-Control: private, max-age=10`
- `GET /api/projects/:id/pages` → `Cache-Control: private, max-age=5`
- `GET /api/projects/:id/health` → `Cache-Control: private, max-age=5`
- `GET /api/audits/:id/progress` → `Cache-Control: no-store` (live data)

### 5.7 Error handling

| Surface | Error | Status | Body |
|---------|-------|--------|------|
| `discoverSite` | malformed XML, 404, 5xx | — | log warn, skip sitemap, continue BFS |
| `discoverSite` | robots.txt missing | — | log debug, fall back to `/sitemap.xml` |
| `runPageAuditJob` | page unreachable (status ≥ 400, network, timeout) | — | synthetic Finding `rule='page.unreachable'`, score `{overall: 0, byCategory: {content: 0}}`, status `completed` |
| `runPageAuditJob` | uncaught exception (plugin crash, DB error) | — | `PageAudit.status='failed'`, `errorMessage` populated, **re-throw** so BullMQ counts the failure (retry 3x, backoff 0s/30s/5min) |
| `runProjectAuditJob` | any uncaught error | — | `Audit.status='failed'`, re-throw. Already-completed `PageAudit`s remain as partial result. |
| `POST /api/pages/:id/audit` | `ProjectPage` not found | 404 | `{error: 'not found'}` |
| `POST /api/pages/:id/audit` | another re-audit queued/running for same page | 409 | `{error: 're-audit in progress'}` |
| `DELETE /api/audits/:id` | already `completed`/`failed`/`cancelled` | 409 | `{error: 'audit is terminal'}` |
| `discoverSite` | infinite link cycle | — | `crawled` Set prevents revisit; cap of 50 sitemaps is hard |

**SSRF safety:** already consolidated in `ac63ca6`. `fetchText` validates
http/https and same-origin (for crawl). `discoverSite.internalUrl` filters
to `base.origin` and strips hash. No change.

## 6. Phases

### 6.1 Phase 1 — Land the WIP

Goal: ship what is in the working tree, validated.

- Commit (squash): `apps/api/src/site-discovery.ts`,
  `apps/api/test/site-discovery.test.ts`, migration
  `20260707130000_add_project_pages`, `audit-job.ts` refactor,
  `routes/projects.ts` (`domain` + `pages[]`), `api.ts` + `ProjectDashboard.tsx`
  in web, two test files updated to the new schema.
- `audit-job.ts`: change `maxPages` default to `0` (no cap); `discoverSite`
  signature default also `0`.
- `routes/projects.ts`: `POST` accepts `{name, domain}` or `{name, rootUrl}`.
  `domain` is normalized to `https://<domain>/`.
- `routes/projects.ts`: `GET /:id` includes `pages: { orderBy: { url: 'asc' } }`.
  No synthetic-page filter in Phase 1 — synthetic pages only exist after
  the §4.2 backfill that runs in Phase 3, at which point the filter is
  added to the route.
- `audit-job.ts`: `ProjectPage.createMany` with `skipDuplicates: true`;
  per-page `runAudit`; `Finding.createMany` inside `$transaction`; `Audit.update` with `score.pagesAudited`; `ProjectPage.updateMany` with
  `lastAuditedAt = finishedAt`.
- Cancel F4 (see §7).
- Update `README.md` with the new smoke test.
- Update `.planning/PROJECT.md`, `.planning/MILESTONES.md`, `.planning/STATE.md` to move F4 to a new "Cancelled" section and F5 to "Active".

Done when: `pnpm test` green, `pnpm typecheck` green, smoke test against
`example.com` returns `pages.length > 1`.

### 6.2 Phase 2 — Mapping UX

Goal: dashboard shows aggregate health + per-page table with filters.

- `GET /api/projects/:id/pages` with filters as in §5.6. Returns
  `[{id, url, discoveredVia, lastAuditedAt, lastScore: {overall, byCategory}|null}]`. `lastScore` is `PageAudit.score` of the most recent
  completed `PageAudit` for that page, joined via Prisma
  `include: { pageAudits: {orderBy: {finishedAt: 'desc'}, take: 1} }`.
- `GET /api/projects/:id/health` returns aggregate computed from the most
  recent `Audit` row for the project. If no audit has run, returns
  `{overall: null, byCategory: null, pagesAudited: 0, pagesTotal: 0, pagesWithError: 0, lastAuditAt: null}`.
- `ProjectDashboard.tsx` redesign:
  - Top: aggregate card (overall + 5 categories as bars).
  - Filters bar: `All | Not audited | With error | By source`.
  - Table: URL, source, last audited (relative), last score, "Re-audit" button (placeholder for Phase 4 — disabled with title "Coming in F5.4").
  - Sticky footer: `pagesAudited / pagesTotal` + spinner while in flight.
- `apps/api/test/projects.test.ts` created; tests for both new routes.
- `apps/web/src/components/ScoreCard.tsx` extended to render null scores gracefully.

Done when: creating a project for `example.com` and waiting for the audit
shows ≥ 1 page in the table with non-null score; filter `not_audited`
correctly hides audited pages.

### 6.3 Phase 3 — Parallel + progress + cancel

Goal: large audits are parallel, observable, and cancellable.

- New queue `auditPageQueue` in `apps/api/src/queue.ts` with
  `concurrency = env.JHEO_AUDIT_PAGE_CONCURRENCY ?? 5`.
- New file `apps/api/src/jobs/page-audit-job.ts` exporting
  `makePageAuditHandler({fetchText})` — same `runAudit` invocation pattern
  as the current `audit-job.ts` per-page loop, but factored out.
- `audit-job.ts` rewritten:
  - Phase 1 fallback: if `JHEO_AUDIT_LEGACY=1`, run sequentially (the
    Phase 1 code path, kept for tests that mock the loop). Default: off.
  - New path: `discoverSite` → `ProjectPage.upsert` → `FlowProducer.add`
    with children → `waitUntilFinished` → aggregate `PageAudit`s → close
    `Audit` with `{overall, byCategory, pagesAudited, pagesTotal}`.
- `routes/audits.ts`:
  - `GET /api/audits/:id/progress` — counts `PageAudit` rows by status for
    this audit; returns `currentPages` = up to 5 URLs with `status='running'`.
  - `DELETE /api/audits/:id` — sets `cancelled`; 409 if terminal.
- `migration.sql` for `PageAudit` (and `Finding.pageAuditId` backfill from
  §4.2).
- `routes/audits.ts` test: `progress` returns correct counts;
  `delete` returns 409 on terminal audit.
- `audit-job.test.ts` (new): orchestrator test using a mocked Flow
  Producer that completes children synchronously; assert `Audit.score` is
  computed and `PageAudit.lastAuditedAt` is updated.

Done when: an audit for a 10-page site completes; `GET /progress` shows
`pagesCompleted` advancing; `DELETE /api/audits/:id` halts the worker
within ≤ 5s.

### 6.4 Phase 4 — Re-audit + delta

Goal: user can re-audit a single page and see what changed.

- `POST /api/pages/:id/audit`:
  - 404 if `ProjectPage` not found.
  - 409 if any `PageAudit` for this page is `queued` or `running`.
  - Else: create `PageAudit {projectPageId, status: 'queued', auditId: null}`,
    enqueue `auditPageQueue` with `{pageAuditId}` (no `auditId`).
- `runPageAuditJob` (extended): when `data.pageAuditId` is set and
  `data.auditId` is null, run the standalone branch.
- **Diff algorithm** (in the job, in a Prisma transaction with the
  `Finding.createMany`):
  1. For each new finding, look up the most recent prior `Finding` for the
     same `(url, category, rule)` *with `previousFindingId = null`* (the
     "head" of the lineage). Scope is the same `projectPageId` so a URL
     cannot pull lineage from another project.
  2. If a prior head exists, set the new finding's `previousFindingId` to
     it.
  3. After insertion, the head for that `(url, category, rule)` is the
     new finding; the old head is now superseded (it still exists; the
     `nextFindings` back-relation points to the new one).
- **Diff labels** (computed in `GET /api/page-audits/:id`, not stored):
  - `NEW` — `previousFindingId IS NULL`
  - `UNCHANGED` — `previousFindingId` set, `severity` and `message` match
  - `IMPROVEMENT` — `previousFindingId` set, `severity` decreased
    (error→warning, warning→info)
  - `REGRESSION` — `previousFindingId` set, `severity` increased
    (info→warning, warning→error) or `message` changed at the same severity
  - `FIXED` — *not stored on a finding*; computed in the response as the
    set of `previousFindingId`s in the immediately prior `PageAudit` for
    this page that are *not* referenced by any finding in the current
    `PageAudit`.
- UI: in the page detail / re-audit modal, each finding row shows a
  badge. Re-audit button in the table now enabled (Phase 4 unblocks it).
- Tests: `apps/api/test/pages.test.ts` and
  `apps/api/test/page-audit-diff.test.ts` — first for HTTP, second for
  the diff algorithm in isolation (mock Prisma).

Done when: re-auditing a page that previously had a "missing alt text"
warning but now passes yields an empty findings list *plus* one entry in
the `fixed` array of the response.

## 7. Cancelled: F4 (Search Console Integration)

F4 (started 2026-07-07, never advanced past planning) is cancelled. The
GSC features are out of scope for F5 and not on the current roadmap.
The `.planning/PROJECT.md` "Active" list and `STATE.md` are updated to
move F4 to a new "Cancelled" section.

## 8. Testing Strategy

**Coverage target:** 80% lines in
`site-discovery.ts`, `audit-job.ts`, `page-audit-job.ts`,
`routes/projects.ts`, `routes/pages.ts`, `routes/audits.ts`.

**Test files:**

- `apps/api/test/site-discovery.test.ts` — unit (WIP, extended in Phase 1)
- `apps/api/test/audit-job-cache.test.ts` — integration (WIP, validated Phase 1)
- `apps/api/test/audit-job-fetchtext.test.ts` — integration (WIP, validated Phase 1)
- `apps/api/test/projects.test.ts` — routes (new Phase 2)
- `apps/api/test/audits.test.ts` — routes (new Phase 3, extended Phase 3)
- `apps/api/test/pages.test.ts` — routes (new Phase 4)
- `apps/api/test/audit-job.test.ts` — orchestrator (new Phase 3)
- `apps/api/test/page-audit-diff.test.ts` — diff algorithm (new Phase 4)

**E2E smoke (manual, in README):**

```bash
# Phase 1
PROJ=$(curl -s -X POST http://127.0.0.1:8080/api/projects \
  -H 'content-type: application/json' \
  -d '{"name":"example","domain":"example.com"}')
PID=$(echo "$PROJ" | jq -r .id)
sleep 10
curl -s http://127.0.0.1:8080/api/projects/$PID | jq '.pages | length'

# Phase 3
AUDIT=$(curl -s -X POST http://127.0.0.1:8080/api/audits \
  -H 'content-type: application/json' \
  -d "{\"projectId\":\"$PID\"}")
AID=$(echo "$AUDIT" | jq -r .id)
for i in 1 2 3 4 5; do
  curl -s http://127.0.0.1:8080/api/audits/$AID/progress | jq .
  sleep 2
done

# Phase 4
PAGEID=$(curl -s http://127.0.0.1:8080/api/projects/$PID | jq -r '.pages[0].id')
RA=$(curl -s -X POST http://127.0.0.1:8080/api/pages/$PAGEID/audit)
PAID=$(echo "$RA" | jq -r .pageAuditId)
sleep 5
curl -s http://127.0.0.1:8080/api/page-audits/$PAID \
  | jq '{findings: [.findings[] | {rule, severity, diff: (if .previousFindingId then "UNCHANGED" else "NEW" end)}], fixed}'
```

## 9. Out of Scope (F5+ candidates)

- Scheduled/recurring audits (cron)
- Hard cap on `maxPages` (currently 0 = no cap)
- WebSocket / SSE push of progress (HTTP polling only)
- Synthetic-page clean-up (synthetic `ProjectPage`s from §4.2 are kept
  forever; F6+ may collapse them)
- Multi-page-audit-per-second rate limiting beyond the env-tunable
  concurrency
- Cross-project findings aggregation (e.g. "all projects with this rule")
- Site-wide `lastGenerated` / freshness from F2 generation output (cross-feature)
- Saving/loading audit presets
