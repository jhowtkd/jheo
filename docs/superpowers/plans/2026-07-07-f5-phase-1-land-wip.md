# F5 Phase 1 — Land WIP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the WIP site-discovery + `ProjectPage` + audit-job refactor as one squashed commit, with `domain` field accepted by `POST /api/projects`, no hard cap on discovery, and a passing smoke test.

**Architecture:** Sitemap-first discovery with internal-link BFS fallback. Per-page `runAudit` is still sequential inside the worker (parallelization is Phase 3). `ProjectPage` rows are upserted with `skipDuplicates: true`. The Audit-pai closes with `pagesAudited` score metadata.

**Tech Stack:** TypeScript strict, Fastify, Prisma + Postgres, BullMQ, vitest. Existing patterns from `apps/api/src/jobs/audit-job.ts` (WIP).

## Global Constraints

- TypeScript strict; `pnpm typecheck` must pass after each task.
- Test command: `pnpm test` from repo root.
- Commit message style: `<scope>(<area>): <imperative>` (see F1–F3 history).
- One squashed commit at end of Phase 1: `feat: domain-aware multi-page audit (F5.1)`.
- `discoverSite` default `maxPages = 0` means **no cap**. Loops use `while (queue.length)` not `while (queue.length && found.size < maxPages)` when `maxPages === 0`.
- The sitemap cap (`seenSitemaps.size < 50`) is a hard safety constant, independent of `maxPages`.
- The `discoverSite` function lives in `apps/api/src/site-discovery.ts` (WIP file, already there).
- `domain` (no protocol) is normalized to `https://<domain>/`. Back-compat: `rootUrl` still works.

## File Structure

**Existing (WIP, will be committed):**
- `apps/api/src/site-discovery.ts` — `discoverSite(rootUrl, fetchText, maxPages=0)`. Adjust default + loop bounds.
- `apps/api/test/site-discovery.test.ts` — extend with `maxPages=0` and edge cases.
- `apps/api/src/jobs/audit-job.ts` — already imports `discoverSite`, creates `ProjectPage` rows, updates `lastAuditedAt`. Validate behavior + ensure score includes `pagesAudited`.
- `apps/api/src/routes/projects.ts` — already accepts `domain`. Validate.
- `apps/api/prisma/migrations/20260707130000_add_project_pages/migration.sql` — already exists. Validate.
- `apps/web/src/api.ts` — already exports `ProjectPage` and `ProjectDetail`.
- `apps/web/src/pages/ProjectDashboard.tsx` — already renders `pages[]`.
- `apps/api/test/audit-job-cache.test.ts` and `audit-job-fetchtext.test.ts` — already updated to new schema. Validate pass.

**Created in Phase 1:**
- (none — Phase 1 is "land WIP + tighten defaults + smoke test", no new files)

---

## Task 1: Tighten `discoverSite` default and loop bounds

**Files:**
- Modify: `apps/api/src/site-discovery.ts:35-105`
- Test: `apps/api/test/site-discovery.test.ts`

**Interfaces:**
- Consumes: `FetchText` from `apps/api/src/jobs/audit-job.ts`
- Produces: `discoverSite(rootUrl: string, fetchText: FetchText, maxPages = 0): Promise<DiscoveredPage[]>` where `maxPages = 0` means "no cap"

- [ ] **Step 1: Update `discoverSite` signature default to `0`**

In `apps/api/src/site-discovery.ts` line 38, change:

```ts
export async function discoverSite(
  rootUrl: string,
  fetchText: FetchText,
  maxPages = 500,
): Promise<DiscoveredPage[]> {
```

to:

```ts
export async function discoverSite(
  rootUrl: string,
  fetchText: FetchText,
  maxPages = 0,
): Promise<DiscoveredPage[]> {
```

- [ ] **Step 2: Update the two `while` loops to honor `maxPages = 0`**

In `apps/api/src/site-discovery.ts`:

Line 56 — change the sitemap loop guard from:
```ts
  while (sitemapQueue.length && found.size < maxPages && seenSitemaps.size < 50) {
```
to:
```ts
  while (sitemapQueue.length && (maxPages === 0 || found.size < maxPages) && seenSitemaps.size < 50) {
```

Line 74 — the inner check:
```ts
          if (url && found.size < maxPages && !found.has(url)) found.set(url, 'sitemap');
```
becomes:
```ts
          if (url && (maxPages === 0 || found.size < maxPages) && !found.has(url)) found.set(url, 'sitemap');
```

Line 85 — the crawl loop:
```ts
    while (crawlQueue.length && found.size < maxPages) {
```
becomes:
```ts
    while (crawlQueue.length && (maxPages === 0 || found.size < maxPages)) {
```

Line 93 — the inner crawl check:
```ts
          if (!found.has(next) && found.size < maxPages) {
            found.set(next, 'crawl');
            crawlQueue.push(next);
          }
```
becomes:
```ts
          if (!found.has(next) && (maxPages === 0 || found.size < maxPages)) {
            found.set(next, 'crawl');
            crawlQueue.push(next);
          }
```

- [ ] **Step 3: Run existing tests — they should still pass**

Run: `pnpm --filter @jheo/api test site-discovery`
Expected: 2 tests pass. The default `maxPages = 500` in the existing tests still works because they pass explicit `discoverSite('https://example.com/', fetchText)` without a third arg; the new default `0` makes those tests run uncapped, but each test only produces 2-3 URLs so the cap never binds.

If a test fails because it relied on the cap (none currently do), change the test call to pass an explicit `maxPages`.

- [ ] **Step 4: Add test for `maxPages = 0` (no cap) with a synthetic 3-page crawl**

In `apps/api/test/site-discovery.test.ts`, add a new `it` block inside the existing `describe('discoverSite', ...)`:

```ts
  it('with maxPages=0 discovers all internal links (no cap)', async () => {
    const fetchText = vi.fn(async (url: string) => {
      if (url.endsWith('/sitemap.xml')) return response('', 404);
      if (url.endsWith('/')) return response('<a href="/a">A</a><a href="/b">B</a>');
      if (url.endsWith('/a')) return response('<a href="/c">C</a>');
      return response('');
    });

    const pages = await discoverSite('https://example.com/', fetchText, 0);
    const urls = pages.map((p) => p.url).sort();
    expect(urls).toEqual([
      'https://example.com/',
      'https://example.com/a',
      'https://example.com/b',
      'https://example.com/c',
    ]);
  });
```

- [ ] **Step 5: Run the new test**

Run: `pnpm --filter @jheo/api test site-discovery`
Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/site-discovery.ts apps/api/test/site-discovery.test.ts
git commit -m "feat(api): default discoverSite to no cap (maxPages=0)"
```

---

## Task 2: Validate `audit-job.ts` integrates `discoverSite` + `ProjectPage` correctly

**Files:**
- Read-only: `apps/api/src/jobs/audit-job.ts` (verify, do not modify unless a gap is found)
- Read-only: `apps/api/test/audit-job-cache.test.ts` (verify passes)
- Read-only: `apps/api/test/audit-job-fetchtext.test.ts` (verify passes)

- [ ] **Step 1: Read `audit-job.ts` and confirm Phase 1 requirements are met**

Open `apps/api/src/jobs/audit-job.ts` and verify the following are present (these are the WIP, do NOT change unless a gap is found):

1. Line 5: `import { discoverSite } from '../site-discovery.js';`
2. Lines 52–55: `maxPages` derived from `configSnapshot.maxPages` with default `500`. **This is a gap — should default to `0` (no cap) per spec.**
3. Line 56: `const pages = await discoverSite(project.rootUrl, fetchTextDedup, maxPages);`
4. Lines 57–60: `prisma.projectPage.createMany({ data: pages.map((p) => ({ projectId: project.id, ...p })), skipDuplicates: true });`
5. Lines 64–93: per-page `runAudit` loop with synthetic `page.unreachable` finding on error.
6. Line 103: `score.pagesAudited = pages.length`.
7. Lines 130–134: `ProjectPage.updateMany` setting `lastAuditedAt = finishedAt` for the audited URLs.

The one gap is item 2: `maxPages` default should be `0` not `500`. Fix it.

- [ ] **Step 2: Fix `maxPages` default to `0` in `audit-job.ts`**

In `apps/api/src/jobs/audit-job.ts` lines 52–55, change:

```ts
      const configuredMax = Number((audit.configSnapshot as { maxPages?: unknown } | undefined)?.maxPages);
      const maxPages = Number.isInteger(configuredMax) && configuredMax > 0
        ? Math.min(configuredMax, 5_000)
        : 500;
```

to:

```ts
      const configuredMax = Number((audit.configSnapshot as { maxPages?: unknown } | undefined)?.maxPages);
      const maxPages = Number.isInteger(configuredMax) && configuredMax > 0
        ? Math.min(configuredMax, 5_000)
        : 0;
```

- [ ] **Step 3: Run the audit-job integration tests**

Run: `pnpm --filter @jheo/api test audit-job`
Expected: both `audit-job-cache.test.ts` and `audit-job-fetchtext.test.ts` pass. The tests mock `prisma` and `runAudit`; they should not be affected by the `maxPages` default change because they do not assert on `maxPages`.

If a test fails, inspect the failure: the test may have been written assuming `maxPages = 500` was the cap (e.g. asserting that discovery stops at 500). Update the test to pass `configSnapshot: { maxPages: 500 }` explicitly.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/jobs/audit-job.ts
git commit -m "fix(api): default audit-job maxPages to 0 (no cap)"
```

---

## Task 3: Validate `POST /api/projects` accepts `domain`

**Files:**
- Read-only: `apps/api/src/routes/projects.ts`
- Read-only: `apps/api/test/projects.test.ts`

- [ ] **Step 1: Read `projects.ts` and confirm the `domain` field is handled**

Open `apps/api/src/routes/projects.ts` and verify:

1. Lines 6–12: `CreateProjectBody` accepts `domain: z.string().min(1).optional()` alongside `rootUrl`.
2. Lines 14–18: `domainUrl(input)` function — strips/adds `https://` and normalizes to `/`.
3. Lines 31–34: `root = domainUrl(parsed.data.domain ?? parsed.data.rootUrl!)`.
4. Lines 35–37: `prisma.project.create({ data: { name: parsed.data.name ?? root.hostname, rootUrl: root.toString() } })`.

If any of these is missing, add it (the file is WIP; small adjustments are allowed in Phase 1).

- [ ] **Step 2: Add test for `domain` field in `projects.test.ts`**

Open `apps/api/test/projects.test.ts`. Find the `describe('routes/projects', ...)` block. After the `creates a project` test, add:

```ts
  it.runIf(canRunDb)('accepts a bare domain and normalizes to https://<domain>/', async () => {
    const res = await app!.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'example', domain: 'example.com' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.rootUrl).toBe('https://example.com/');
    expect(body.name).toBe('example');
  });
```

- [ ] **Step 3: Run the projects route tests**

Run: `pnpm --filter @jheo/api test projects`
Expected: passes (3+ tests in the `routes/projects` describe block).

If the test fails with `rootUrl` not normalized, check `domainUrl` in `routes/projects.ts:14-18`. The expected shape is `new URL('/', 'https://example.com').toString()` → `'https://example.com/'`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/projects.ts apps/api/test/projects.test.ts
git commit -m "test(api): cover POST /api/projects with bare domain"
```

---

## Task 4: Validate `GET /api/projects/:id` includes `pages[]`

**Files:**
- Read-only: `apps/api/src/routes/projects.ts:45-56`
- Read-only: `apps/web/src/api.ts:38-39`
- Read-only: `apps/web/src/pages/ProjectDashboard.tsx`

- [ ] **Step 1: Confirm the route includes `pages`**

Open `apps/api/src/routes/projects.ts` lines 45–56 and verify the `findUnique` includes `pages: { orderBy: { url: 'asc' } }`. If missing, add it.

- [ ] **Step 2: Confirm the web types are aligned**

Open `apps/web/src/api.ts` and verify:

- Line 38: `export type ProjectPage = { id: string; url: string; discoveredVia: 'root' | 'sitemap' | 'crawl'; lastAuditedAt: string | null };`
- Line 39: `export type ProjectDetail = Project & { audits: Audit[]; pages: ProjectPage[] };`

If `discoveredVia` is typed as a broader `string`, narrow it to the union.

- [ ] **Step 3: Confirm `ProjectDashboard.tsx` renders `pages`**

Open `apps/web/src/pages/ProjectDashboard.tsx` line ~38. Verify there is a render of `project.data.pages.map((page) => ...)`. If missing, the WIP file already has it; do not add new visual elements in Phase 1.

- [ ] **Step 4: Run typecheck and tests**

Run:
```bash
pnpm typecheck
pnpm test
```

Expected: typecheck clean, all tests pass.

- [ ] **Step 5: No commit (this is a verification task; only commit if a small fix was needed)**

If a fix was made in any of Steps 1–3:

```bash
git add apps/api/src/routes/projects.ts apps/web/src/api.ts apps/web/src/pages/ProjectDashboard.tsx
git commit -m "chore(f5.1): align project detail types and route include"
```

Otherwise proceed.

---

## Task 5: End-to-end smoke test against `example.com`

**Files:**
- Read-only: docker stack (`docker compose -f docker/docker-compose.yml up -d`)
- Read-only: `README.md` (update smoke section)

- [ ] **Step 1: Bring up the docker stack**

Run: `pnpm run compose:up`
Expected: `docker-api-1`, `docker-postgres-1`, `docker-redis-1` all running.

If `POST /api/projects` returns Prisma `P2021` ("table does not exist"), the F5 ProjectPage migration has not been pushed:
```bash
docker exec docker-api-1 npx prisma db push --skip-generate
```

- [ ] **Step 2: Run the smoke test from the spec**

```bash
PROJ=$(curl -s -X POST http://127.0.0.1:8080/api/projects \
  -H 'content-type: application/json' \
  -d '{"name":"smoke-f5","domain":"example.com"}')
PID=$(echo "$PROJ" | jq -r .id)
echo "project id: $PID"
sleep 10
curl -s http://127.0.0.1:8080/api/projects/$PID | jq '{name, rootUrl, pages: (.pages | length)}'
```

Expected: `pages` length ≥ 2 (example.com has more than one discoverable URL). Real-world, expect 1–5 pages.

- [ ] **Step 3: Update the README smoke section**

In `README.md`, replace the existing "Smoke test" block with:

````markdown
### Smoke test

```bash
PROJ=$(curl -s -X POST http://127.0.0.1:8080/api/projects \
  -H 'content-type: application/json' \
  -d '{"name":"example","domain":"example.com"}')
PID=$(echo "$PROJ" | jq -r .id)
AUDIT=$(curl -s -X POST http://127.0.0.1:8080/api/audits \
  -H 'content-type: application/json' \
  -d "{\"projectId\":\"$PID\",\"config\":{}}")
AID=$(echo "$AUDIT" | jq -r .id)
sleep 8
curl -s http://127.0.0.1:8080/api/audits/$AID | jq '{status, score, findingsCount: (.findings | length), pagesAudited: .score.pagesAudited}'
curl -s http://127.0.0.1:8080/api/projects/$PID | jq '.pages | length'
```

Expected: `status: "completed"`, `score.overall` plus `score.byCategory` populated for
`seo`, `cwv`, `geo`, `a11y`, `content`, `findingsCount > 0`, `pagesAudited ≥ 1`,
and the project detail returns `pages.length ≥ 1`.
````

- [ ] **Step 4: Commit README update**

```bash
git add README.md
git commit -m "docs: update smoke test to include domain field + pages"
```

- [ ] **Step 5: Tear down**

```bash
pnpm run compose:down
```

---

## Task 6: Squash into one F5.1 commit (final)

**Files:** all changes from Tasks 1–5.

- [ ] **Step 1: Verify working tree state**

Run: `git status --short`
Expected: clean working tree (no uncommitted changes).

- [ ] **Step 2: Soft-reset and re-commit as a single squashed commit**

The plan produced 4–5 atomic commits. The user requested a single squash for Phase 1. Squash them:

```bash
git log --oneline -10
# identify the oldest Phase 1 commit (from Task 1, 2, 3, 4, 5)
# example: if the first F5.1 commit is 6 commits ago:
git reset --soft HEAD~5
git status --short
# confirm only F5.1 files are staged
git commit -m "feat: domain-aware multi-page audit (F5.1)

- POST /api/projects accepts {name, domain} (normalized to https://<domain>/)
- discoverSite is the new entry point: sitemap.xml with sitemapindex,
  internal-link BFS fallback
- default maxPages is 0 (no cap) at both discoverSite and audit-job
- ProjectPage persists discovered URLs with discoveredVia and lastAuditedAt
- audit-job refactored: discover → upsert pages → per-page runAudit →
  aggregate score with pagesAudited
- Audit-pai is created on POST /api/projects; pages appear in
  GET /api/projects/:id after the worker runs

Tests: site-discovery unit (3 cases), audit-job integration (2 cases),
projects route (2 cases). Smoke test against example.com returns ≥ 1 page."
```

Expected: a single new commit at HEAD with the F5.1 message. The 4–5 atomic commits are gone from the log.

- [ ] **Step 3: Verify the squash**

Run: `git log --oneline -3`
Expected: the new squash commit is on top; the previous 4–5 commits are gone.

Run: `git show --stat HEAD`
Expected: file list matches the WIP set (site-discovery.ts, audit-job.ts, projects.ts, project_pages migration, web api.ts + ProjectDashboard.tsx, test files, README.md).

- [ ] **Step 4: Run final verification**

```bash
pnpm typecheck
pnpm test
pnpm run compose:up
# (wait ~10s for stack to be ready)
# Re-run the smoke test from Task 5 Step 2
pnpm run compose:down
```

Expected: typecheck clean, all tests pass, smoke test returns `pages.length ≥ 1`.

---

## Self-Review Checklist

- [ ] `discoverSite` defaults to `maxPages = 0`; loops honor it
- [ ] `audit-job.ts` defaults to `maxPages = 0`
- [ ] `POST /api/projects` accepts `{name, domain}` and normalizes
- [ ] `GET /api/projects/:id` returns `pages[]`
- [ ] Web types are aligned (`ProjectPage`, `ProjectDetail`)
- [ ] All tests pass; typecheck clean
- [ ] Smoke test against `example.com` returns ≥ 1 page
- [ ] One squashed commit at HEAD
