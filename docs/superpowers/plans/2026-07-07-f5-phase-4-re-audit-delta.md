# F5 Phase 4 — Re-Audit & Delta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user can re-audit a single page on demand (`POST /api/pages/:id/audit`) and see the diff (NEW, FIXED, REGRESSION, IMPROVEMENT, UNCHANGED) of findings versus the page's previous audit.

**Architecture:** Standalone `PageAudit` (no parent `AuditId`) created on demand. The existing `runPageAuditJob` is extended with a standalone branch that uses `Finding.previousFindingId` lineage to compute the diff in the response (diff labels are not stored). The `Finding` row's `previousFindingId` is computed inside the same transaction that creates the new finding.

**Tech Stack:** TypeScript strict, Fastify, Prisma, BullMQ, React. Existing patterns from Phase 3 `page-audit-job.ts`.

## Global Constraints

- TypeScript strict; `pnpm typecheck` must pass after each task.
- Test command: `pnpm test` from repo root.
- **`Finding.auditId` is now nullable** (Phase 3 made it required for parented audits; Phase 4 reverts to nullable so standalone re-audits can have findings without a parent `Audit`). This requires a schema migration.
- **`Finding.previousFindingId`** is set at creation time by looking up the most recent prior `Finding` (head of the lineage) for `(url, category, rule)` scoped to the same `projectPageId` *with `previousFindingId IS NULL`*. The lookup runs in the same transaction as the `Finding.createMany` to avoid races.
- **Diff labels** are computed in the API response, not stored on `Finding`. Labels: `NEW`, `UNCHANGED`, `IMPROVEMENT`, `REGRESSION`, `FIXED`. Severities (low→high): `info < warning < error`. `FIXED` is rendered as the set of `previousFindingId`s in the prior `PageAudit` for the page that are not referenced by any current `PageAudit` finding.
- **Conflict detection** for `POST /api/pages/:id/audit`: if any `PageAudit` for the same `projectPageId` is in `queued` or `running` status, return 409. The first re-audit wins.
- **404** if `ProjectPage.id` does not exist.
- **Cross-project check** (single-tenant invariant): the page must exist. Since there is no `projectId` in the route, the check reduces to "page exists".
- **Re-audit button** on the dashboard (Phase 2 placeholder) is now enabled. On click, calls `POST /api/pages/:id/audit`, shows a toast, and triggers a refetch of pages + health.

## File Structure

**Modified:**
- `apps/api/prisma/schema.prisma` — `Finding.auditId` becomes nullable.
- `apps/api/prisma/migrations/20260707300000_f5_finding_auditid_nullable/migration.sql` — make `auditId` nullable.
- `apps/api/src/jobs/page-audit-job.ts` — extend with standalone branch + `previousFindingId` lookup.
- `apps/web/src/api.ts` — add `reAuditPage`, `PageAuditDetail`, `FindingDiff` types.
- `apps/web/src/pages/ProjectDashboard.tsx` — enable re-audit button + diff modal.
- `apps/web/src/components/FindingList.tsx` — accept `diff` and render badges.

**Created:**
- `apps/api/src/routes/pages.ts` — `POST /api/pages/:id/audit` + `GET /api/page-audits/:id`.
- `apps/api/test/pages.test.ts` — route tests.
- `apps/api/test/page-audit-diff.test.ts` — diff algorithm test (mock Prisma).

---

## Task 1: Make `Finding.auditId` nullable

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260707300000_f5_finding_auditid_nullable/migration.sql`

- [ ] **Step 1: Update the schema**

In `apps/api/prisma/schema.prisma`, in the `Finding` model, change:

```prisma
model Finding {
  // ...
  auditId       String
  audit         Audit   @relation(fields: [auditId], references: [id], onDelete: Cascade)
  // ...
}
```

to:

```prisma
model Finding {
  // ...
  auditId       String?
  audit         Audit?  @relation(fields: [auditId], references: [id], onDelete: Cascade)
  // ...
}
```

Also make the `auditId` index optional in the new Prisma schema (drop the explicit `@@index([auditId])` if present — Prisma auto-creates indexes for FKs and the existing index is on `auditId`).

- [ ] **Step 2: Write the migration SQL**

Create the directory `apps/api/prisma/migrations/20260707300000_f5_finding_auditid_nullable/` and write `migration.sql`:

```sql
-- Drop the existing FK from Finding to Audit (CASCADE)
ALTER TABLE "Finding" DROP CONSTRAINT IF EXISTS "Finding_auditId_fkey";

-- Drop the index on auditId
DROP INDEX IF EXISTS "Finding_auditId_idx";

-- Make auditId nullable
ALTER TABLE "Finding" ALTER COLUMN "auditId" DROP NOT NULL;

-- Re-add FK as ON DELETE SET NULL (so deleting an Audit nulls the findings' auditId)
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_auditId_fkey"
FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

The change is small and safe: existing rows have `auditId` populated (Phase 3 backfill), and they remain populated. New standalone findings can leave `auditId` null.

- [ ] **Step 3: Run `prisma db push`**

Run: `docker exec docker-api-1 npx prisma db push --skip-generate`
Expected: "Your database is now in sync with your schema."

- [ ] **Step 4: Regenerate the Prisma client**

Run: `docker exec docker-api-1 npx prisma generate`

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: clean. The new schema has `auditId: string | null` in `Finding`; the existing code paths in Phase 3 used `auditId!` (the non-null assertion) when creating findings, which still typechecks.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260707300000_f5_finding_auditid_nullable/
git commit -m "feat(db): Finding.auditId nullable for standalone re-audits"
```

---

## Task 2: Extend `runPageAuditJob` with `previousFindingId` lookup + standalone branch

**Files:**
- Modify: `apps/api/src/jobs/page-audit-job.ts`
- Test: `apps/api/test/page-audit-diff.test.ts` (new)

- [ ] **Step 1: Extract the finding-creation + lineage into a helper**

In `apps/api/src/jobs/page-audit-job.ts`, refactor the `try` block of `handle()` to call a helper `createFindingsWithLineage(findings, pageAuditId, projectPageId, auditId)`. This isolates the lineage logic for testability.

Replace the existing per-page `try` block (the `result.findings.map(...)` createMany) with:

```ts
      const newFindings = result.findings;
      const findingsData = await attachLineage(newFindings, pageAuditId, projectPageId);
      await prisma.$transaction([
        prisma.finding.createMany({
          data: findingsData.map((f) => ({
            auditId, // string in parented path; null in standalone path (task will set it)
            pageAuditId,
            category: f.category,
            severity: f.severity,
            rule: f.rule,
            message: f.message,
            url: f.url,
            selector: f.selector ?? null,
            evidence: f.evidence as object,
            previousFindingId: f.previousFindingId,
          })),
        }),
        prisma.pageAudit.update({
          where: { id: pageAuditId },
          data: { status: 'completed', finishedAt, score: pageScore },
        }),
        prisma.projectPage.update({
          where: { id: projectPageId },
          data: { lastAuditedAt: finishedAt },
        }),
      ]);
```

And add at the top of the file (above `makePageAuditHandler`):

```ts
async function attachLineage(
  findings: Finding[],
  pageAuditId: string,
  projectPageId: string,
): Promise<Array<Finding & { previousFindingId: string | null }>> {
  // For each new finding, look up the most recent prior head
  // (Finding with previousFindingId IS NULL) for the same (url, category, rule)
  // scoped to the same projectPageId.
  const result: Array<Finding & { previousFindingId: string | null }> = [];
  for (const f of findings) {
    const prior = await prisma.finding.findFirst({
      where: {
        url: f.url,
        category: f.category,
        rule: f.rule,
        pageAudit: { projectPageId },
        previousFindingId: null,
      },
      orderBy: { id: 'desc' },
    });
    result.push({ ...f, previousFindingId: prior?.id ?? null });
  }
  return result;
}
```

The current `Finding` from `@jheo/core` does not have a `previousFindingId` field; the spread `...f` is a TS cast — adjust the return type to `Array<Omit<Finding, 'previousFindingId'> & { previousFindingId: string | null }>` if TS complains.

- [ ] **Step 2: Add the standalone branch**

The current `handle()` function reads `data.auditId` and assumes it is set. For Phase 4, the same worker handles standalone jobs (where `data.auditId` is `null`).

Update the `handle()` function to:
- If `data.auditId` is null, skip the parent-Audit cancellation check (standalones are not cancelable in Phase 4).
- In the `prisma.finding.createMany` data, set `auditId: data.auditId` (now nullable — Prisma accepts `string | null`).

- [ ] **Step 3: Add a unit test for the lineage helper**

Create `apps/api/test/page-audit-diff.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/db.js', () => ({
  prisma: {
    finding: { findFirst: vi.fn() },
  },
}));

// Import after mocking
import { prisma } from '../src/db.js';
// The helper is internal; we test it via the public runPageAuditJob flow
// (a separate integration test covers the full flow). For unit, we assert
// the helper's expected behavior with a small refactor: expose it.

import { attachLineage } from '../src/jobs/page-audit-job.js';

describe('attachLineage', () => {
  it('returns previousFindingId=null when no prior head exists', async () => {
    (prisma.finding.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const findings = await attachLineage(
      [{ category: 'seo', severity: 'warning', rule: 'meta.missing', message: 'no meta', url: 'https://x.test/', evidence: {} }],
      'pa-new',
      'pp-1',
    );
    expect(findings[0]?.previousFindingId).toBeNull();
  });

  it('returns the prior head id when one exists', async () => {
    (prisma.finding.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'f-prior' });
    const findings = await attachLineage(
      [{ category: 'seo', severity: 'error', rule: 'meta.missing', message: 'no meta', url: 'https://x.test/', evidence: {} }],
      'pa-new',
      'pp-1',
    );
    expect(findings[0]?.previousFindingId).toBe('f-prior');
  });
});
```

The test imports `attachLineage` from the job file. To make this work, **export** `attachLineage` from `page-audit-job.ts`. Add `export` to the function declaration.

- [ ] **Step 4: Run the new test**

Run: `pnpm --filter @jheo/api test page-audit-diff`
Expected: 2 tests pass.

If the test fails because `attachLineage` is not exported, export it. If the import path is wrong, the file is `apps/api/src/jobs/page-audit-job.ts` → test imports `../src/jobs/page-audit-job.js` (the `.js` extension is the ESM convention used throughout the repo).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/jobs/page-audit-job.ts apps/api/test/page-audit-diff.test.ts
git commit -m "feat(api): Finding lineage via previousFindingId (F5.4)"
```

---

## Task 3: Create `apps/api/src/routes/pages.ts` with `POST` and `GET` routes

**Files:**
- Create: `apps/api/src/routes/pages.ts`
- Modify: `apps/api/src/server.ts` (register the new route)
- Test: `apps/api/test/pages.test.ts` (new)

**Interfaces:**
- `POST /api/pages/:id/audit` — returns `{ pageAuditId }`
- `GET /api/page-audits/:id` — returns `PageAuditDetail` with `findings` annotated with `diff` and a `fixed: string[]` array

- [ ] **Step 1: Create the route file**

Create `apps/api/src/routes/pages.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

const SEV_RANK: Record<string, number> = { info: 0, warning: 1, error: 2 };

function diffLabel(newF: { severity: string; message: string; previousFindingId: string | null }, prior: { severity: string; message: string } | null): 'NEW' | 'UNCHANGED' | 'IMPROVEMENT' | 'REGRESSION' {
  if (!prior) return 'NEW';
  if (newF.severity === prior.severity && newF.message === prior.message) return 'UNCHANGED';
  const newRank = SEV_RANK[newF.severity] ?? 0;
  const priorRank = SEV_RANK[prior.severity] ?? 0;
  if (newRank < priorRank) return 'IMPROVEMENT';
  if (newRank > priorRank) return 'REGRESSION';
  return 'REGRESSION'; // same severity, different message
}

export async function pageRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>('/api/pages/:id/audit', async (req, reply) => {
    const page = await prisma.projectPage.findUnique({ where: { id: req.params.id } });
    if (!page) return reply.code(404).send({ error: 'not found' });

    const existing = await prisma.pageAudit.findFirst({
      where: { projectPageId: page.id, status: { in: ['queued', 'running'] } },
    });
    if (existing) return reply.code(409).send({ error: 're-audit in progress' });

    const pageAudit = await prisma.pageAudit.create({
      data: {
        projectPageId: page.id,
        status: 'queued',
      },
    });
    // Enqueue via the page-audit queue
    const { auditPageQueue } = await import('../queue.js');
    await auditPageQueue.add('standalone', {
      pageAuditId: pageAudit.id,
      auditId: null as unknown as string, // shape requires auditId; job treats null as standalone
      projectPageId: page.id,
      url: page.url,
    });
    return { pageAuditId: pageAudit.id };
  });

  app.get<{ Params: { id: string } }>('/api/page-audits/:id', async (req, reply) => {
    reply.header('cache-control', 'private, max-age=5');
    const pageAudit = await prisma.pageAudit.findUnique({
      where: { id: req.params.id },
      include: {
        findings: { include: { previousFinding: true } },
        projectPage: { select: { id: true, url: true, projectId: true } },
      },
    });
    if (!pageAudit) return reply.code(404).send({ error: 'not found' });

    // Compute diff labels
    const findings = pageAudit.findings.map((f) => {
      const label = diffLabel(
        { severity: f.severity, message: f.message, previousFindingId: f.previousFindingId },
        f.previousFinding ? { severity: f.previousFinding.severity, message: f.previousFinding.message } : null,
      );
      return {
        id: f.id,
        category: f.category,
        severity: f.severity,
        rule: f.rule,
        message: f.message,
        url: f.url,
        selector: f.selector,
        evidence: f.evidence,
        previousFindingId: f.previousFindingId,
        diff: label,
      };
    });

    // Compute FIXED: prior head Finding ids from the immediately prior PageAudit
    // for this page that are not referenced by any finding in the current PageAudit.
    const priorPageAudit = await prisma.pageAudit.findFirst({
      where: {
        projectPageId: pageAudit.projectPageId,
        status: 'completed',
        id: { not: pageAudit.id },
        finishedAt: { lt: pageAudit.finishedAt ?? new Date(0) },
      },
      orderBy: { finishedAt: 'desc' },
      include: {
        findings: {
          where: { previousFindingId: null },
          select: { id: true, rule: true, category: true, severity: true, message: true, url: true },
        },
      },
    });
    const currentHeads = new Set(pageAudit.findings.map((f) => f.previousFindingId).filter((id): id is string => Boolean(id)));
    const fixed = priorPageAudit
      ? priorPageAudit.findings
          .filter((f) => !currentHeads.has(f.id))
          .map((f) => ({
            id: f.id,
            category: f.category,
            severity: f.severity,
            rule: f.rule,
            message: f.message,
            url: f.url,
          }))
      : [];

    return {
      id: pageAudit.id,
      projectPageId: pageAudit.projectPageId,
      url: pageAudit.projectPage.url,
      status: pageAudit.status,
      score: pageAudit.score,
      startedAt: pageAudit.startedAt,
      finishedAt: pageAudit.finishedAt,
      errorMessage: pageAudit.errorMessage,
      findings,
      fixed,
    };
  });
}
```

**Note on `auditId: null as unknown as string`:** the `PageAuditJobData` type currently has `auditId: string`. The TypeScript hack is to widen the type. The cleaner fix is to update `PageAuditJobData` to have `auditId: string | null`. Do that in `queue.ts`:

```ts
export type PageAuditJobData = {
  pageAuditId: string;
  auditId: string | null;
  projectPageId: string;
  url: string;
};
```

This is a breaking type change for the orchestrator code in `audit-job.ts` (Phase 3 Task 5) that passes `auditId: audit.id` — that is still a `string` at runtime, so it satisfies `string | null`. The `page-audit-job.ts` (Phase 3 Task 3) uses `auditId!` — replace with `auditId ?? null` and update the cancellation check:

```ts
    if (auditId) {
      const parent = await prisma.audit.findUnique({ where: { id: auditId } });
      // ...
    }
```

This is correct: the `if (auditId)` check already handles `null`. Just remove the `!` from the `auditId!` in the `prisma.finding.createMany` data block.

- [ ] **Step 2: Update `queue.ts` to make `PageAuditJobData.auditId` nullable**

In `apps/api/src/queue.ts`, change:

```ts
export type PageAuditJobData = {
  pageAuditId: string;
  auditId: string;
  projectPageId: string;
  url: string;
};
```

to:

```ts
export type PageAuditJobData = {
  pageAuditId: string;
  auditId: string | null;
  projectPageId: string;
  url: string;
};
```

- [ ] **Step 3: Update `page-audit-job.ts` to handle nullable `auditId`**

In the `Finding.createMany` data block, replace `auditId: auditId!,` with `auditId: auditId,`. The `if (auditId)` block above the cancellation check is already correct.

- [ ] **Step 4: Update `audit-job.ts` to pass `auditId: string` (still satisfies `string | null`)**

The Phase 3 orchestrator passes `auditId: audit.id` in the per-page jobs. This is fine — `string` is assignable to `string | null`. No code change.

- [ ] **Step 5: Register the route in `server.ts`**

Open `apps/api/src/server.ts`. Find the `await app.register(...)` calls for routes. Add:

```ts
import { pageRoutes } from './routes/pages.js';
// ...
await app.register(pageRoutes);
```

- [ ] **Step 6: Add tests in `pages.test.ts`**

Create `apps/api/test/pages.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { prisma } from '../src/db.js';

let app: Awaited<ReturnType<typeof buildServer>> | undefined;
let canRunDb = false;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    canRunDb = true;
  } catch {
    canRunDb = false;
    return;
  }
  app = await buildServer();
  await app.ready();
});
afterAll(async () => {
  if (app) await app.close();
  try { await prisma.$disconnect(); } catch { /* ignore */ }
});

describe('routes/pages', () => {
  it.runIf(canRunDb)('POST /:id/audit returns 404 for unknown page', async () => {
    const res = await app!.inject({ method: 'POST', url: '/api/pages/does-not-exist/audit' });
    expect(res.statusCode).toBe(404);
  });

  it.runIf(canRunDb)('POST /:id/audit returns 409 if a re-audit is in progress', async () => {
    // Create a project + page manually
    const project = await prisma.project.create({
      data: { name: 'pages-route-test', rootUrl: 'https://example.com/' },
    });
    const page = await prisma.projectPage.create({
      data: { projectId: project.id, url: 'https://example.com/test', discoveredVia: 'root' },
    });
    await prisma.pageAudit.create({
      data: { projectPageId: page.id, status: 'running' },
    });
    const res = await app!.inject({ method: 'POST', url: `/api/pages/${page.id}/audit` });
    expect(res.statusCode).toBe(409);
  });

  it.runIf(canRunDb)('POST /:id/audit queues a standalone re-audit', async () => {
    const project = await prisma.project.create({
      data: { name: 'pages-queue-test', rootUrl: 'https://example.com/' },
    });
    const page = await prisma.projectPage.create({
      data: { projectId: project.id, url: 'https://example.com/queue', discoveredVia: 'root' },
    });
    const res = await app!.inject({ method: 'POST', url: `/api/pages/${page.id}/audit` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pageAuditId).toBeTruthy();
  });

  it.runIf(canRunDb)('GET /:id returns 404 for unknown page audit', async () => {
    const res = await app!.inject({ method: 'GET', url: '/api/page-audits/does-not-exist' });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 7: Run the new tests**

Run: `pnpm --filter @jheo/api test pages`
Expected: 4 tests pass.

- [ ] **Step 8: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/routes/pages.ts apps/api/src/queue.ts apps/api/src/jobs/page-audit-job.ts apps/api/src/server.ts apps/api/test/pages.test.ts
git commit -m "feat(api): re-audit page route + diff labels in GET (F5.4)"
```

---

## Task 4: Update web types + Re-audit button + diff UI

**Files:**
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/pages/ProjectDashboard.tsx`
- Modify: `apps/web/src/components/FindingList.tsx`

- [ ] **Step 1: Add web types and client functions**

In `apps/web/src/api.ts`, add:

```ts
export type FindingDiff = 'NEW' | 'UNCHANGED' | 'IMPROVEMENT' | 'REGRESSION';

export type FindingWithDiff = {
  id: string;
  category: string;
  severity: 'info' | 'warning' | 'error';
  rule: string;
  message: string;
  url: string;
  selector: string | null;
  evidence: Record<string, unknown>;
  previousFindingId: string | null;
  diff: FindingDiff;
};

export type PageAuditDetail = {
  id: string;
  projectPageId: string;
  url: string;
  status: string;
  score: { overall: number; byCategory: Record<string, number | null> } | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  findings: FindingWithDiff[];
  fixed: Array<{ id: string; category: string; severity: string; rule: string; message: string; url: string }>;
};

export async function reAuditPage(pageId: string): Promise<{ pageAuditId: string }> {
  const res = await fetch(`${apiUrl}/api/pages/${pageId}/audit`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Re-audit failed: ${res.status}`);
  }
  return res.json();
}

export async function getPageAuditDetail(pageAuditId: string): Promise<PageAuditDetail> {
  const res = await fetch(`${apiUrl}/api/page-audits/${pageAuditId}`);
  if (!res.ok) throw new Error(`Failed to load page audit: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: Update `FindingList.tsx` to render diff badges**

Open `apps/web/src/components/FindingList.tsx`. Add a new optional `diff` field to `Finding`:

```ts
import type { Finding, FindingDiff } from '../api.js';

interface Props {
  findings: Array<Finding & { diff?: FindingDiff }>;
  // ...
}
```

In the JSX, for each finding, render a small badge next to the severity tag:

```tsx
{finding.diff && (
  <span className={`diff-badge diff-badge--${finding.diff.toLowerCase()}`}>
    {finding.diff}
  </span>
)}
```

Add CSS in `apps/web/src/styles.css`:

```css
.diff-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: var(--radius-pill);
  font-size: var(--fs-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  margin-left: var(--space-2);
}
.diff-badge--new { background: var(--accent); color: var(--bg); }
.diff-badge--unchanged { background: var(--border); color: var(--text-muted); }
.diff-badge--improvement { background: #2ea043; color: white; }
.diff-badge--regression { background: #d73a49; color: white; }
```

(`--fs-xs` may not exist; if not, add `:root { --fs-xs: 0.75rem; }`.)

For the `fixed` array, render a separate collapsible section above the findings:

```tsx
{fixed && fixed.length > 0 && (
  <section className="card" style={{ marginBottom: 'var(--space-4)' }}>
    <h3>Fixed since last audit ({fixed.length})</h3>
    <ul>
      {fixed.map((f) => (
        <li key={f.id}>
          <span className={`tag tag--${f.severity}`}>{f.severity}</span> {f.rule}: {f.message}
        </li>
      ))}
    </ul>
  </section>
)}
```

- [ ] **Step 3: Update `ProjectDashboard.tsx` to enable the Re-audit button + show diff modal**

In the page table, replace the disabled Re-audit button with a working one:

```tsx
import { reAuditPage, getPageAuditDetail } from '../api.js';

// In the component:
const [openPageAuditId, setOpenPageAuditId] = useState<string | null>(null);
const detail = useQuery({
  queryKey: ['page-audit-detail', openPageAuditId],
  queryFn: () => getPageAuditDetail(openPageAuditId!),
  enabled: Boolean(openPageAuditId),
  refetchInterval: (query) => (query.state.data?.status === 'queued' || query.state.data?.status === 'running') ? 1_000 : false,
});

const reAudit = useMutation({
  mutationFn: (pageId: string) => reAuditPage(pageId),
  onSuccess: (data) => setOpenPageAuditId(data.pageAuditId),
});
```

Replace the disabled button:

```tsx
<button
  type="button"
  onClick={() => reAudit.mutate(page.id)}
  disabled={reAudit.isPending}
>
  {reAudit.isPending ? 'Queuing…' : 'Re-audit'}
</button>
```

After the table, add a modal that opens when `openPageAuditId` is set:

```tsx
{openPageAuditId && detail.data && (
  <div className="modal" role="dialog" aria-modal="true" onClick={() => setOpenPageAuditId(null)}>
    <div className="modal__panel" onClick={(e) => e.stopPropagation()}>
      <button className="modal__close" onClick={() => setOpenPageAuditId(null)} aria-label="Close">×</button>
      <h2>Re-audit: {detail.data.url}</h2>
      <p>Status: <strong>{detail.data.status}</strong></p>
      {detail.data.fixed && detail.data.fixed.length > 0 && (
        <section>
          <h3>Fixed since last audit</h3>
          <ul>
            {detail.data.fixed.map((f) => (
              <li key={f.id}>{f.rule}: {f.message}</li>
            ))}
          </ul>
        </section>
      )}
      <FindingList findings={detail.data.findings} />
    </div>
  </div>
)}
```

Add modal CSS:

```css
.modal {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.modal__panel {
  background: var(--bg);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  max-width: 800px;
  width: 90%;
  max-height: 90vh;
  overflow: auto;
  position: relative;
}
.modal__close {
  position: absolute; top: var(--space-3); right: var(--space-3);
  background: none; border: none; font-size: 1.5rem; cursor: pointer;
  color: var(--text-muted);
}
```

(If `--radius-lg` does not exist, add it: `--radius-lg: 12px;`.)

- [ ] **Step 4: Typecheck + build**

Run: `pnpm typecheck && pnpm --filter @jheo/web run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/api.ts apps/web/src/pages/ProjectDashboard.tsx apps/web/src/components/FindingList.tsx apps/web/src/styles.css
git commit -m "feat(web): re-audit button + diff modal + badges"
```

---

## Task 5: End-to-end smoke test (Phase 4)

**Files:**
- Modify: `README.md` (Phase 4 smoke test)

- [ ] **Step 1: Bring up the stack and create a project**

Run: `pnpm run compose:up` and wait 10s.

Create a project, run an audit, wait for it to complete:

```bash
PROJ=$(curl -s -X POST http://127.0.0.1:8080/api/projects \
  -H 'content-type: application/json' \
  -d '{"name":"f5-4-smoke","domain":"example.com"}')
PID=$(echo "$PROJ" | jq -r .id)
AUDIT=$(curl -s -X POST http://127.0.0.1:8080/api/audits \
  -H 'content-type: application/json' \
  -d "{\"projectId\":\"$PID\"}")
AID=$(echo "$AUDIT" | jq -r .id)
sleep 10
```

- [ ] **Step 2: Trigger a re-audit on a page**

```bash
PAGEID=$(curl -s http://127.0.0.1:8080/api/projects/$PID | jq -r '.pages[0].id')
RA=$(curl -s -X POST http://127.0.0.1:8080/api/pages/$PAGEID/audit)
PAID=$(echo "$RA" | jq -r .pageAuditId)
echo "page audit id: $PAID"
sleep 8
```

- [ ] **Step 3: Inspect the diff**

```bash
curl -s http://127.0.0.1:8080/api/page-audits/$PAID | jq '{
  status,
  findings: [.findings[] | {rule, severity, diff}],
  fixed
}'
```

Expected: most findings have `diff: "NEW"` (or `UNCHANGED` if the page was audited twice in a row with identical output). `fixed` is an empty array on the first re-audit (no prior `PageAudit` to compare against). The status is `completed`.

- [ ] **Step 4: Trigger a second re-audit and check for FIXED entries**

```bash
RA2=$(curl -s -X POST http://127.0.0.1:8080/api/pages/$PAGEID/audit)
PAID2=$(echo "$RA2" | jq -r .pageAuditId)
sleep 8
curl -s http://127.0.0.1:8080/api/page-audits/$PAID2 | jq '{fixed: .fixed | length, findingsDiff: [.findings[] | .diff] | unique}'
```

Expected: `fixed` is `[]` or low number (because example.com is stable, the second run produces the same findings). Findings diffs are `NEW` (lineage was not established for the first re-audit's findings; the second re-audit looks back at the first's heads).

- [ ] **Step 5: Test 409 conflict**

Trigger a re-audit, then immediately trigger another on the same page:

```bash
RA3=$(curl -s -X POST http://127.0.0.1:8080/api/pages/$PAGEID/audit)
PAID3=$(echo "$RA3" | jq -r .pageAuditId)
RA4=$(curl -s -X POST http://127.0.0.1:8080/api/pages/$PAGEID/audit)
echo "second response:"
echo "$RA4" | jq .
sleep 1
```

Expected: the second `RA4` response is a 409 (or succeeds if the first re-audit completed within the 1s gap — both are valid outcomes for this manual smoke test).

- [ ] **Step 6: Update README**

In `README.md`, add:

````markdown
### Re-audit + delta (F5.4)

```bash
PID=<project-id>
PAGEID=$(curl -s http://127.0.0.1:8080/api/projects/$PID | jq -r '.pages[0].id')
RA=$(curl -s -X POST http://127.0.0.1:8080/api/pages/$PAGEID/audit)
PAID=$(echo "$RA" | jq -r .pageAuditId)
sleep 5
curl -s http://127.0.0.1:8080/api/page-audits/$PAID | jq '{findings: [.findings[] | {rule, diff}], fixed}'
```

Expected: findings have `diff: NEW|UNCHANGED|IMPROVEMENT|REGRESSION`; `fixed` lists findings from the prior audit that no longer appear.
````

- [ ] **Step 7: Commit + tear down**

```bash
git add README.md
git commit -m "docs: F5.4 smoke test for re-audit + diff"
pnpm run compose:down
```

---

## Self-Review Checklist

- [ ] `Finding.auditId` is nullable in the schema and migration
- [ ] `runPageAuditJob` handles standalone jobs (`auditId === null`)
- [ ] `attachLineage` looks up prior head finding per `(url, category, rule)` within the same `projectPageId`
- [ ] `POST /api/pages/:id/audit` returns 404 / 409 / 200 correctly
- [ ] `GET /api/page-audits/:id` returns findings with `diff: NEW|UNCHANGED|IMPROVEMENT|REGRESSION` and a `fixed` array
- [ ] Web dashboard Re-audit button is enabled; modal shows diff with badges
- [ ] All tests pass; typecheck clean; web build succeeds
- [ ] Smoke test confirms the full re-audit + diff loop end to end
- [ ] Each task is its own commit
