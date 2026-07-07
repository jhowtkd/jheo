# F5 Phase 3 — Parallel + Progress + Cancel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Large audits run in parallel across an `auditPageQueue` (BullMQ Flow Producer), progress is observable via `GET /api/audits/:id/progress`, and `DELETE /api/audits/:id` cancels a running audit within ≤ 5s. Introduce the `PageAudit` table with backfill of pre-Phase-3 `Finding`s via synthetic `ProjectPage` rows.

**Architecture:** `auditQueue.runProjectAuditJob` becomes a thin orchestrator: discovery → Flow Producer fan-out → `waitUntilFinished` → aggregate `PageAudit`s → close `Audit`. `auditPageQueue.runPageAuditJob` runs `runAudit` per page with idempotency and cancellation checks. `Project.maxPages` is added with default `0` (no cap). `Finding.pageAuditId` becomes NOT NULL after backfill. `Finding.previousFindingId` is added (used in Phase 4).

**Tech Stack:** TypeScript strict, Fastify, Prisma + Postgres, BullMQ + FlowProducer. Existing patterns: `publishQueue` for retry policy; `audit-job.ts` (Phase 1) for the per-page `runAudit` loop.

## Global Constraints

- TypeScript strict; `pnpm typecheck` must pass after each task.
- Test command: `pnpm test` from repo root.
- **One Prisma migration per Phase 3** — it adds: `Project.maxPages`, `PageAudit` table, `Finding.pageAuditId` (backfilled, then NOT NULL), `Finding.previousFindingId` (nullable, no backfill). Migration must be a single `migration.sql` that runs cleanly against a DB with pre-Phase-3 data.
- **Backfill rule (F5 spec §4.2):** for every existing `Audit` row that has at least one `Finding`, create one synthetic `ProjectPage` (`url = 'synthetic://audit/<auditId>'`) and one `PageAudit` (`auditId = <auditId>, projectPageId = <syntheticPageId>, status = 'completed', finishedAt = <audit.finishedAt ?? audit.createdAt>, score = <audit.score>`). Re-link all `Finding`s of that `Audit` to the new `PageAudit`. Then `Finding.pageAuditId` becomes NOT NULL.
- **BullMQ Flow Producer** is the primary orchestrator. If it fails at runtime (e.g. group.waitUntilFinished hangs), the documented fallback is a polling loop in `runProjectAuditJob`: every 2s, count `PageAudit`s with terminal status for this `auditId`; close when count == pagesTotal or after 30min. Both paths are coded; the active one is selected by an env var `JHEO_AUDIT_ORCHESTRATOR` (default `flow`; set to `polling` to switch). This is the only env var new in Phase 3.
- **`auditPageQueue` concurrency** is `JHEO_AUDIT_PAGE_CONCURRENCY` env var, default `5`.
- **`auditPageQueue` retry policy:** 3 attempts, backoff `0s → 30s → 5min` (matches `publishQueue`).
- **Cancellation check** is at the start of every `runPageAuditJob`. The check is: re-read the parent `Audit` (if `auditId` is set); if `status === 'cancelled'`, mark this `PageAudit` as `status = 'skipped'` and return. Standalone `PageAudit`s (Phase 4) are not cancelable in Phase 3.
- **`Audit.status` lifecycle** in Phase 3: `queued → running → completed | failed | cancelled`. `cancelled` is a terminal state added in Phase 3.
- **`DELETE /api/audits/:id`:** sets `status = 'cancelled'`; returns 409 if the audit is already terminal (`completed`/`failed`/`cancelled`).

## File Structure

**Modified:**
- `apps/api/prisma/schema.prisma` — adds `Project.maxPages`, `PageAudit`, `Finding.pageAuditId`, `Finding.previousFindingId`.
- `apps/api/src/queue.ts` — adds `auditPageQueue` and `auditOrchestrator` env wiring.
- `apps/api/src/jobs/audit-job.ts` — refactored orchestrator using Flow Producer (and polling fallback).
- `apps/api/src/server.ts` — wires `auditPageQueue` worker.
- `apps/api/src/routes/audits.ts` — adds `GET /:id/progress` and `DELETE /:id`.

**Created:**
- `apps/api/prisma/migrations/20260707200000_f5_page_audit/migration.sql` — the schema + backfill migration.
- `apps/api/src/jobs/page-audit-job.ts` — the new `runPageAuditJob`.
- `apps/api/test/audit-job.test.ts` — orchestrator tests (mock Flow Producer / polling).
- `apps/api/test/audits.test.ts` — route tests for `progress` and `delete`.
- (Optional) `apps/api/test/migrations/page-audit-backfill.test.ts` — verifies backfill SQL.

---

## Task 1: Schema changes + backfill migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260707200000_f5_page_audit/migration.sql`

- [ ] **Step 1: Add `Project.maxPages` to the schema**

In `apps/api/prisma/schema.prisma`, in the `model Project { ... }` block (around line 12), add the field. Place it after `rootUrl`:

```prisma
  maxPages              Int       @default(0)
```

(`maxPages` is `Int @default(0)` — 0 means no cap. The comment is added in §6 of the design doc; the schema does not need a Prisma comment.)

- [ ] **Step 2: Add `PageAudit` model**

In `apps/api/prisma/schema.prisma`, after the `ProjectPage` model (around line 34), add:

```prisma
model PageAudit {
  id            String      @id @default(cuid())
  auditId       String?
  audit         Audit?      @relation(fields: [auditId], references: [id], onDelete: Cascade)
  projectPageId String
  projectPage   ProjectPage @relation(fields: [projectPageId], references: [id], onDelete: Cascade)
  status        String      // 'queued' | 'running' | 'completed' | 'failed' | 'skipped'
  score         Json?
  errorMessage  String?
  startedAt     DateTime?
  finishedAt    DateTime?
  createdAt     DateTime    @default(now())
  findings      Finding[]

  @@index([auditId])
  @@index([projectPageId])
  @@index([status])
}
```

- [ ] **Step 3: Add the `ProjectPage.pageAudits` back-relation**

In `apps/api/prisma/schema.prisma`, in the `ProjectPage` model, add the back-relation field. Add it after `createdAt`:

```prisma
  pageAudits    PageAudit[]
```

- [ ] **Step 4: Add `Finding.pageAuditId` and `Finding.previousFindingId`**

In `apps/api/prisma/schema.prisma`, in the `Finding` model (around line 51), add the new fields. Place them after `evidence`:

```prisma
  pageAuditId       String
  pageAudit         PageAudit  @relation(fields: [pageAuditId], references: [id], onDelete: Cascade)
  previousFindingId String?
  previousFinding   Finding?   @relation("FindingLineage", fields: [previousFindingId], references: [id])
  nextFindings      Finding[]  @relation("FindingLineage")
```

And add `@@index([pageAuditId])` inside the `Finding` model.

- [ ] **Step 5: Add the `Audit.pageAudits` back-relation**

In the `Audit` model (around line 36), add after `findings Finding[]`:

```prisma
  pageAudits  PageAudit[]
```

- [ ] **Step 6: Write the migration SQL**

Create the directory `apps/api/prisma/migrations/20260707200000_f5_page_audit/` and write `migration.sql` inside it:

```sql
-- 1) Add Project.maxPages
ALTER TABLE "Project" ADD COLUMN "maxPages" INTEGER NOT NULL DEFAULT 0;

-- 2) Create PageAudit table
CREATE TABLE "PageAudit" (
    "id" TEXT NOT NULL,
    "auditId" TEXT,
    "projectPageId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "score" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PageAudit_auditId_idx" ON "PageAudit"("auditId");
CREATE INDEX "PageAudit_projectPageId_idx" ON "PageAudit"("projectPageId");
CREATE INDEX "PageAudit_status_idx" ON "PageAudit"("status");

ALTER TABLE "PageAudit" ADD CONSTRAINT "PageAudit_auditId_fkey"
FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) Add Finding.pageAuditId and Finding.previousFindingId as NULLABLE
ALTER TABLE "Finding" ADD COLUMN "pageAuditId" TEXT;
ALTER TABLE "Finding" ADD COLUMN "previousFindingId" TEXT;

CREATE INDEX "Finding_pageAuditId_idx" ON "Finding"("pageAuditId");

-- 4) Backfill: for each Audit with Findings, create a synthetic ProjectPage
--    and a PageAudit, then re-link the Findings.
DO $$
DECLARE
    a          RECORD;
    syn_id     TEXT;
    pa_id      TEXT;
    target_audit_finished TIMESTAMP(3);
    target_audit_score    JSONB;
BEGIN
    FOR a IN
        SELECT DISTINCT f."auditId" AS aid
        FROM "Finding" f
        WHERE f."pageAuditId" IS NULL
    LOOP
        -- Pick the audit's finishedAt and score, or fall back to createdAt / null
        SELECT COALESCE(au."finishedAt", au."createdAt") INTO target_audit_finished
        FROM "Audit" au WHERE au."id" = a.aid;
        SELECT au."score" INTO target_audit_score
        FROM "Audit" au WHERE au."id" = a.aid;

        -- Create the synthetic ProjectPage
        syn_id := 'synthetic-' || a.aid;
        INSERT INTO "ProjectPage" ("id", "projectId", "url", "discoveredVia", "createdAt")
        SELECT syn_id, au."projectId", 'synthetic://audit/' || au."id", 'root', NOW()
        FROM "Audit" au WHERE au."id" = a.aid
        ON CONFLICT ("id") DO NOTHING;

        -- Create the PageAudit
        INSERT INTO "PageAudit" ("id", "auditId", "projectPageId", "status", "score", "finishedAt", "createdAt")
        VALUES (
            'pa-' || a.aid,
            a.aid,
            syn_id,
            'completed',
            target_audit_score,
            target_audit_finished,
            NOW()
        )
        ON CONFLICT ("id") DO NOTHING;

        -- Re-link Findings
        UPDATE "Finding" SET "pageAuditId" = 'pa-' || a.aid
        WHERE "auditId" = a.aid AND "pageAuditId" IS NULL;
    END LOOP;
END $$;

-- 5) Add the pageAuditId FK constraint now that all rows are populated
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_pageAuditId_fkey"
FOREIGN KEY ("pageAuditId") REFERENCES "PageAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6) Add the FindingLineage self-FK
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_previousFindingId_fkey"
FOREIGN KEY ("previousFindingId") REFERENCES "Finding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 7) Add the PageAudit → ProjectPage FK
ALTER TABLE "PageAudit" ADD CONSTRAINT "PageAudit_projectPageId_fkey"
FOREIGN KEY ("projectPageId") REFERENCES "ProjectPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8) Make Finding.pageAuditId NOT NULL now that all rows have it
ALTER TABLE "Finding" ALTER COLUMN "pageAuditId" SET NOT NULL;
```

This script is order-sensitive: NULL column → backfill → FK → SET NOT NULL.

- [ ] **Step 7: Run `prisma db push` against the dev DB**

Run: `docker exec docker-api-1 npx prisma db push --skip-generate`
Expected: "Your database is now in sync with your schema."

If the migration fails because the synthetic-page `id` collides with an existing row, the `ON CONFLICT DO NOTHING` clause handles it. If it fails for any other reason, inspect the error and fix the SQL.

- [ ] **Step 8: Regenerate the Prisma client**

Run: `docker exec docker-api-1 npx prisma generate`
Expected: "Generated Prisma Client."

- [ ] **Step 9: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

If the `apps/api` code references `pageAudits` and the new types are not yet used, typecheck is unaffected. If it complains about `pageAuditId` being required in `Finding.create` calls in the existing tests, those tests will need updating in the next task.

- [ ] **Step 10: Run a smoke SQL check to confirm backfill worked**

If the dev DB has pre-Phase-3 data:

```bash
docker exec docker-postgres-1 psql -U jheo -d jheo -c 'SELECT COUNT(*) FROM "PageAudit";'
docker exec docker-postgres-1 psql -U jheo -d jheo -c 'SELECT COUNT(*) FROM "Finding" WHERE "pageAuditId" IS NULL;'
```

Expected: `PageAudit` count ≥ 1 (one per pre-Phase-3 audit that had findings); `Finding` count where `pageAuditId IS NULL` is `0`.

If the dev DB is empty (no pre-Phase-3 data), both counts are 0 — that is fine. The next task creates a fresh project + audit and validates the schema end-to-end.

- [ ] **Step 11: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260707200000_f5_page_audit/
git commit -m "feat(db): PageAudit table + Finding.pageAuditId backfill (F5.3)"
```

---

## Task 2: Update `audit-job.ts` to create `PageAudit` rows (sequential path first)

**Files:**
- Modify: `apps/api/src/jobs/audit-job.ts`
- Test: `apps/api/test/audit-job-cache.test.ts`, `apps/api/test/audit-job-fetchtext.test.ts`

- [ ] **Step 1: Read the existing tests to know the mock shape**

Open `apps/api/test/audit-job-cache.test.ts` and `apps/api/test/audit-job-fetchtext.test.ts`. The mocks declare:
```ts
prisma: {
  audit: { findUnique: vi.fn(), update: vi.fn() },
  project: { findUnique: vi.fn() },
  projectPage: { createMany: vi.fn(), updateMany: vi.fn() },
  finding: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  $transaction: transaction,
}
```

The new `pageAudit` mock needs to be added.

- [ ] **Step 2: Add `pageAudit` mocks to both test files**

In each test file's `vi.mock('../src/db.js', ...)` block, add to the `prisma` object:

```ts
      pageAudit: {
        create: vi.fn().mockResolvedValue({ id: 'pa1' }),
        update: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
      },
```

(Add this between `projectPage` and `finding` for readability.)

- [ ] **Step 3: Update `audit-job.ts` to create a `PageAudit` per page and link findings**

Open `apps/api/src/jobs/audit-job.ts`. The current per-page loop (lines 65–93) does:
- `fetchTextDedup(page.url)` → `htmlRes`
- `runAudit(ctx)` → `result`
- Pushes `findings` and `score` to local arrays

Refactor it to:
1. Create a `PageAudit` row with `status: 'running'`, `auditId`, `projectPageId`, `startedAt: now`.
2. Wrap the `runAudit` + finding + score update in a try/catch that sets the `PageAudit` to `completed` or `failed`.
3. Move the `Finding.createMany` and `PageAudit.update` into the same `$transaction`.

The new shape (the per-page block replaces lines 65–93):

```ts
      const findings: Finding[] = [];
      const scores: Array<{ overall: number; byCategory?: Record<string, number | null> }> = [];

      for (const page of pages) {
        const pageAudit = await prisma.pageAudit.create({
          data: {
            auditId: audit.id,
            projectPageId: page.id,
            status: 'running',
            startedAt: new Date(),
          },
        });
        try {
          const htmlRes = await fetchTextDedup(page.url);
          if (htmlRes.status < 200 || htmlRes.status >= 400) throw new Error(`HTTP ${htmlRes.status}`);
          const ctx = {
            url: page.url,
            html: htmlRes.text,
            fetchText: fetchTextDedup,
            log() {},
            [PLAIN_TEXT]: htmlRes.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean),
            [JSONLD_BLOCKS]: Array.from(htmlRes.text.matchAll(
              /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
            )),
          };
          const result = await runAudit(ctx);
          const pageScore = result.score as { overall: number; byCategory?: Record<string, number | null> };
          findings.push(...result.findings);
          scores.push(pageScore);
          const finishedAt = new Date();
          await prisma.$transaction([
            prisma.finding.createMany({
              data: result.findings.map((f) => ({
                auditId: audit.id,
                pageAuditId: pageAudit.id,
                category: f.category,
                severity: f.severity,
                rule: f.rule,
                message: f.message,
                url: f.url,
                selector: f.selector ?? null,
                evidence: f.evidence as object,
              })),
            }),
            prisma.pageAudit.update({
              where: { id: pageAudit.id },
              data: { status: 'completed', finishedAt, score: pageScore },
            }),
            prisma.projectPage.update({
              where: { id: page.id },
              data: { lastAuditedAt: finishedAt },
            }),
          ]);
        } catch (error) {
          findings.push({
            category: 'content',
            severity: 'error',
            rule: 'page.unreachable',
            message: `Page could not be audited: ${error instanceof Error ? error.message : String(error)}`,
            url: page.url,
            evidence: {},
          });
          scores.push({ overall: 0, byCategory: { content: 0 } });
          await prisma.pageAudit.update({
            where: { id: pageAudit.id },
            data: {
              status: 'failed',
              finishedAt: new Date(),
              errorMessage: error instanceof Error ? error.message : String(error),
              score: { overall: 0, byCategory: { content: 0 } },
            },
          });
        }
      }
```

Note: the outer `$transaction` from the original code is **gone** — each per-page transaction is independent. The final `Audit.update` becomes a single statement (no more `createMany` at the outer level, since findings are now created per page).

Replace the lines 110–135 block (the outer `$transaction`) with:

```ts
      await prisma.audit.update({
        where: { id: audit.id },
        data: { status: 'completed', finishedAt, score },
      });
```

(`finishedAt` and `score` are already defined earlier in the function.)

- [ ] **Step 4: Update the outer try/catch failure path to mark `Audit.status = 'failed'`**

The existing `catch (err)` block (lines 136–142) already does this. No change needed.

- [ ] **Step 5: Run the audit-job tests**

Run: `pnpm --filter @jheo/api test audit-job`
Expected: both `audit-job-cache.test.ts` and `audit-job-fetchtext.test.ts` pass. The test mocks already include `pageAudit: { create, update, findFirst }` from Step 2, and the new per-page transaction does not break the existing `$transaction` mock (it still accepts any number of ops).

If a test fails because the mock for `finding.createMany` was changed (it was `vi.fn().mockResolvedValue({ count: 0 })`), the per-page transaction in the implementation calls `finding.createMany` once per page, which the mock handles.

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/jobs/audit-job.ts apps/api/test/audit-job-cache.test.ts apps/api/test/audit-job-fetchtext.test.ts
git commit -m "feat(api): per-page PageAudit creation in audit-job"
```

---

## Task 3: Create `apps/api/src/jobs/page-audit-job.ts` (the per-page worker)

**Files:**
- Create: `apps/api/src/jobs/page-audit-job.ts`
- Modify: `apps/api/src/queue.ts`

**Interfaces:**
- Consumes: `data: { auditId?, projectPageId, pageAuditId, url }`
- Produces: `makePageAuditHandler({fetchText})` exported for `server.ts` to register

- [ ] **Step 1: Create the new job file**

Create `apps/api/src/jobs/page-audit-job.ts`:

```ts
import type { Job } from 'bullmq';
import { runAudit, type Finding } from '@jheo/core';
import type { AuditJobData, PageAuditJobData } from '../queue.js';
import { prisma } from '../db.js';
import type { FetchText } from './audit-job.js';

const PLAIN_TEXT = Symbol('jheo.audit.plainText');
const JSONLD_BLOCKS = Symbol('jheo.audit.jsonLdBlocks');

export function makePageAuditHandler(opts: { fetchText: FetchText }) {
  return async function handle(job: Job<PageAuditJobData>) {
    const { pageAuditId, auditId, projectPageId, url } = job.data;
    const pageAudit = await prisma.pageAudit.findUnique({ where: { id: pageAuditId } });
    if (!pageAudit) return; // orphan — bail
    if (pageAudit.status === 'completed') return; // idempotency

    // Cancellation check (only for parented audits; standalone Phase 4 has no auditId)
    if (auditId) {
      const parent = await prisma.audit.findUnique({ where: { id: auditId } });
      if (parent?.status === 'cancelled') {
        await prisma.pageAudit.update({
          where: { id: pageAuditId },
          data: { status: 'skipped', finishedAt: new Date() },
        });
        return;
      }
    }

    const inflight = new Map<string, Promise<{ status: number; headers: Record<string, string>; text: string }>>();
    const fetchTextDedup: FetchText = (url, init) => {
      const key = `${url}|${JSON.stringify(init?.headers ?? {})}`;
      let p = inflight.get(key);
      if (!p) {
        p = opts.fetchText(url, init);
        inflight.set(key, p);
      }
      return p;
    };

    await prisma.pageAudit.update({
      where: { id: pageAuditId },
      data: { status: 'running', startedAt: new Date() },
    });
    try {
      const htmlRes = await fetchTextDedup(url);
      if (htmlRes.status < 200 || htmlRes.status >= 400) throw new Error(`HTTP ${htmlRes.status}`);
      const ctx = {
        url,
        html: htmlRes.text,
        fetchText: fetchTextDedup,
        log() {},
        [PLAIN_TEXT]: htmlRes.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean),
        [JSONLD_BLOCKS]: Array.from(htmlRes.text.matchAll(
          /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
        )),
      };
      const result = await runAudit(ctx);
      const pageScore = result.score as { overall: number; byCategory?: Record<string, number | null> };
      const finishedAt = new Date();
      await prisma.$transaction([
        prisma.finding.createMany({
          data: result.findings.map((f) => ({
            auditId: auditId ?? null,
            pageAuditId,
            category: f.category,
            severity: f.severity,
            rule: f.rule,
            message: f.message,
            url: f.url,
            selector: f.selector ?? null,
            evidence: f.evidence as object,
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
    } catch (error) {
      await prisma.pageAudit.update({
        where: { id: pageAuditId },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : String(error),
          score: { overall: 0, byCategory: { content: 0 } },
        },
      });
      throw error; // BullMQ counts the failure → triggers retry
    }
  };
}
```

**Note on `Finding.auditId`:** in Phase 3, every `PageAudit` is parented to an `Audit`, so `auditId ?? null` is never `null` in this task. In Phase 4, standalone `PageAudit`s have `auditId === null`, and `Finding.auditId` is made nullable (the schema migration in Task 4 of Phase 4 makes `Finding.auditId` nullable, OR the spec could keep it required and store the auditId of "the most recent audit the project has" as a fallback — discuss in Phase 4 plan). For now, the cast `auditId ?? null` is correct; the Prisma schema has `Finding.auditId` as required, so this **will** fail typecheck until Phase 4 either makes it nullable or removes the standalone branch.

For Phase 3, the standalone branch is **not exposed** (the route `POST /api/pages/:id/audit` does not exist yet). The `auditId ?? null` is dead code; remove it and use `auditId!`:

```ts
            auditId: auditId!,
```

Do this in the actual implementation. The `!` is safe because the only caller in Phase 3 is `audit-job.ts` which always sets `auditId`.

- [ ] **Step 2: Add `PageAuditJobData` type and `auditPageQueue` to `queue.ts`**

Open `apps/api/src/queue.ts`. Find the existing `AuditJobData` type and the `auditQueue` declaration. Add below them:

```ts
export type PageAuditJobData = {
  pageAuditId: string;
  auditId: string;
  projectPageId: string;
  url: string;
};

export const auditPageQueue = new Queue<PageAuditJobData>('auditPage', {
  connection: { host: env.REDIS_HOST, port: env.REDIS_PORT },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
  },
});

// Worker concurrency is read in server.ts when creating the Worker.
export const auditPageConcurrency = Number(env.JHEO_AUDIT_PAGE_CONCURRENCY ?? 5);

// Orchestrator selection: 'flow' (default) or 'polling'
export const auditOrchestrator = (env.JHEO_AUDIT_ORCHESTRATOR ?? 'flow') as 'flow' | 'polling';
```

If `env` is typed via a Zod schema in `queue.ts`, follow the same pattern for the new env vars.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: clean (the new file imports `PageAuditJobData` from `queue.ts`).

If typecheck fails on `auditId!` in the new file, confirm `data.auditId` is `string` (not `string | undefined`) in `PageAuditJobData`. It is.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/jobs/page-audit-job.ts apps/api/src/queue.ts
git commit -m "feat(api): per-page audit worker (auditPageQueue)"
```

---

## Task 4: Wire `auditPageQueue` worker in `server.ts`

**Files:**
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Find where `auditQueue` Worker is created**

Open `apps/api/src/server.ts`. Locate the `new Worker<AuditJobData>(...)` block. The pattern likely follows the F3 publish worker.

- [ ] **Step 2: Add the `auditPageQueue` Worker below the `auditQueue` Worker**

Add:

```ts
import { auditPageQueue, auditPageConcurrency } from './queue.js';
import { makePageAuditHandler } from './jobs/page-audit-job.js';

// ...
const pageAuditWorker = new Worker<PageAuditJobData>(
  'auditPage',
  makePageAuditHandler({ fetchText }),
  {
    connection: { host: env.REDIS_HOST, port: env.REDIS_PORT },
    concurrency: auditPageConcurrency,
  },
);
```

(`fetchText` is the existing function used by the audit worker — it's the SSRF-guarded fetch defined in `server.ts` or imported from a helper. Find it by `grep "fetchText" apps/api/src/`.)

- [ ] **Step 3: Handle worker `failed` event**

If the existing `auditQueue` worker attaches a `failed` event listener (for logging), add the same for `pageAuditWorker`. Match the existing pattern.

- [ ] **Step 4: Run typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: clean. The new worker is registered; tests do not exercise it yet.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "feat(api): register auditPageQueue worker in server"
```

---

## Task 5: Refactor `audit-job.ts` to use Flow Producer

**Files:**
- Modify: `apps/api/src/jobs/audit-job.ts`
- Test: `apps/api/test/audit-job.test.ts` (new)

- [ ] **Step 1: Replace the per-page loop with a Flow Producer fan-out**

In `apps/api/src/jobs/audit-job.ts`, find the per-page `for (const page of pages)` block added in Task 2. Replace it with:

```ts
      // Read maxPages from config (default 0 = no cap)
      const configuredMax = Number((audit.configSnapshot as { maxPages?: unknown } | undefined)?.maxPages);
      const maxPages = Number.isInteger(configuredMax) && configuredMax > 0
        ? Math.min(configuredMax, 5_000)
        : (project.maxPages > 0 ? project.maxPages : 0);
      const pagesToRun = maxPages > 0 ? pages.slice(0, maxPages) : pages;

      // Create the PageAudit rows (one per page, status='queued').
      // The pages were already inserted by projectPage.createMany in Phase 1
      // and each has an id we can reference.
      await prisma.pageAudit.createMany({
        data: pagesToRun.map((page) => ({
          auditId: audit.id,
          projectPageId: page.id,
          status: 'queued',
        })),
        skipDuplicates: true,
      });

      if (auditOrchestrator === 'polling') {
        await runPollingOrchestrator(audit.id, pagesToRun, opts);
      } else {
        await runFlowOrchestrator(audit.id, pagesToRun, opts);
      }
```

The `runFlowOrchestrator` and `runPollingOrchestrator` are local helpers; define them as private functions within the file (above the `makeAuditHandler` export, or inside it as closures).

- [ ] **Step 2: Add the Flow orchestrator helper**

Above `makeAuditHandler` (or as a top-level function), add:

```ts
import { FlowProducer } from 'bullmq';

const flowProducer = new FlowProducer({ connection: { host: env.REDIS_HOST, port: env.REDIS_PORT } });

async function runFlowOrchestrator(
  auditId: string,
  pages: Array<{ id: string; url: string }>,
  opts: { fetchText: FetchText },
): Promise<void> {
  const children = pages.map((page) => ({
    name: 'page',
    queueName: 'auditPage',
    data: {
      pageAuditId: '', // will be filled below
      auditId,
      projectPageId: page.id,
      url: page.url,
    } satisfies PageAuditJobData,
  }));
  // Look up the PageAudit rows we just created (status='queued') to get their IDs
  const pageAudits = await prisma.pageAudit.findMany({
    where: { auditId, status: 'queued' },
    orderBy: { id: 'asc' },
  });
  // Match children to pageAudits by projectPageId
  const enriched = children.map((child) => {
    const pa = pageAudits.find((p) => p.projectPageId === child.data.projectPageId);
    if (!pa) throw new Error(`PageAudit not found for projectPageId ${child.data.projectPageId}`);
    return { ...child, data: { ...child.data, pageAuditId: pa.id } };
  });

  const group = await flowProducer.add({
    name: 'audit-group',
    queueName: 'auditPage',
    data: { auditId },
    children: enriched,
  });
  await group.job.waitUntilFinished(
    new QueueEvents('auditPage', { connection: { host: env.REDIS_HOST, port: env.REDIS_PORT } }),
    30 * 60 * 1000, // 30 min deadline
  );
}
```

The `QueueEvents` is created inline; in production, hoist it to a module-level singleton. For Phase 3, inline is fine.

- [ ] **Step 3: Add the polling orchestrator helper**

```ts
async function runPollingOrchestrator(
  auditId: string,
  pages: Array<{ id: string; url: string }>,
  opts: { fetchText: FetchText },
): Promise<void> {
  // Manually enqueue one job per page
  for (const page of pages) {
    const pa = await prisma.pageAudit.findFirst({
      where: { auditId, projectPageId: page.id },
    });
    if (!pa) continue;
    await auditPageQueue.add('page', {
      pageAuditId: pa.id,
      auditId,
      projectPageId: page.id,
      url: page.url,
    });
  }
  // Poll until all PageAudits are terminal or 30 min
  const deadline = Date.now() + 30 * 60 * 1000;
  const total = pages.length;
  while (Date.now() < deadline) {
    const done = await prisma.pageAudit.count({
      where: {
        auditId,
        status: { in: ['completed', 'failed', 'skipped'] },
      },
    });
    if (done >= total) return;
    await new Promise((r) => setTimeout(r, 2_000));
  }
}
```

- [ ] **Step 4: Import the new symbols at the top of `audit-job.ts`**

```ts
import { auditPageQueue, auditOrchestrator, type PageAuditJobData } from '../queue.js';
import { Queue, QueueEvents, FlowProducer } from 'bullmq';
import { env } from '../env.js';
```

(`env` is the existing Zod-parsed env object; confirm by reading `apps/api/src/env.ts`.)

- [ ] **Step 5: Move score aggregation into a helper called by both orchestrators**

After either orchestrator returns, `audit-job.ts` must close the `Audit` with the aggregated score. Add:

```ts
      // Aggregate score from PageAudits
      const pageAudits = await prisma.pageAudit.findMany({
        where: { auditId: audit.id, status: 'completed' },
        select: { score: true },
      });
      const pageScores = pageAudits
        .map((p) => p.score as { overall: number; byCategory?: Record<string, number | null> } | null)
        .filter((s): s is { overall: number; byCategory?: Record<string, number | null> } => s !== null);

      const categories = ['seo', 'cwv', 'geo', 'a11y', 'content'] as const;
      const byCategory = Object.fromEntries(
        categories.map((category) => {
          const values = pageScores
            .map((s) => s.byCategory?.[category])
            .filter((v): v is number => v !== null && v !== undefined);
          return [category, values.length ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length) : null];
        }),
      );
      const score = {
        overall: pageScores.length
          ? Math.round(pageScores.reduce((sum, s) => sum + s.overall, 0) / pageScores.length)
          : 0,
        byCategory,
        pagesAudited: pageAudits.length,
        pagesTotal: pagesToRun.length,
        discoveryLimitReached: pagesToRun.length === pages.length, // approximation; can be refined
      };
      const finishedAt = new Date();

      await prisma.audit.update({
        where: { id: audit.id },
        data: { status: 'completed', finishedAt, score },
      });
```

This replaces the old per-page score aggregation in the file.

- [ ] **Step 6: Add a unit test for the orchestrator**

Create `apps/api/test/audit-job.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/queue.js', () => ({
  auditQueue: { add: vi.fn() },
  auditPageQueue: { add: vi.fn() },
  auditOrchestrator: 'polling', // use polling path; Flow Producer is tested via integration
  auditPageConcurrency: 5,
}));

vi.mock('../src/db.js', () => {
  return {
    prisma: {
      audit: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
      project: { findUnique: vi.fn() },
      projectPage: { createMany: vi.fn().mockResolvedValue({ count: 0 }), upsert: vi.fn(), update: vi.fn() },
      pageAudit: {
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      finding: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    },
  };
});

vi.mock('@jheo/core', () => ({
  runAudit: vi.fn(async () => ({ findings: [], score: { overall: 100, byCategory: { seo: 100, cwv: 100, geo: 100, a11y: 100, content: 100 } } })),
}));

import { makeAuditHandler } from '../src/jobs/audit-job.js';

const fetchText = vi.fn(async () => ({ status: 200, headers: {}, text: '<html></html>' }));

describe('runProjectAuditJob polling orchestrator', () => {
  it('aggregates page scores and closes the audit with pagesAudited + pagesTotal', async () => {
    const { prisma } = await import('../src/db.js');
    (prisma.audit.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'a1', projectId: 'p1', status: 'queued', configSnapshot: {},
    });
    (prisma.project.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1', rootUrl: 'https://example.com/', maxPages: 0,
    });
    (prisma.pageAudit.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { score: { overall: 80, byCategory: { seo: 80, cwv: 80, geo: 80, a11y: 80, content: 80 } } },
      { score: { overall: 100, byCategory: { seo: 100, cwv: 100, geo: 100, a11y: 100, content: 100 } } },
    ]);
    (prisma.pageAudit.count as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(2);

    const handler = makeAuditHandler({ fetchText });
    const fakeJob = { data: { auditId: 'a1' } } as Parameters<typeof handler>[0];
    await handler(fakeJob);

    const update = (prisma.audit.update as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
    expect(update.data.status).toBe('completed');
    expect(update.data.score.pagesAudited).toBe(2);
    expect(update.data.score.overall).toBe(90);
  });
});
```

The mock `auditOrchestrator: 'polling'` forces the polling path. The test does not exercise the `runAudit` mock (the polling path does not call it directly — it enqueues `auditPageQueue.add` jobs which the test does not run; the orchestrator just waits for `count == total`).

- [ ] **Step 7: Run the new test**

Run: `pnpm --filter @jheo/api test audit-job`
Expected: all 3 tests pass (1 new + 2 existing).

If the test fails on `auditOrchestrator: 'polling'` not being read from the mock, check the import path: `audit-job.ts` imports `auditOrchestrator` from `../queue.js`, and the mock replaces the whole `queue.js` module. The mock is correct.

- [ ] **Step 8: Typecheck + full test suite**

Run: `pnpm typecheck && pnpm test`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/jobs/audit-job.ts apps/api/test/audit-job.test.ts
git commit -m "feat(api): Flow Producer orchestrator for project audits"
```

---

## Task 6: Add `GET /api/audits/:id/progress` and `DELETE /api/audits/:id` routes

**Files:**
- Modify: `apps/api/src/routes/audits.ts`
- Test: `apps/api/test/audits.test.ts`

- [ ] **Step 1: Read the current `audits.ts` to see the pattern**

Open the file. Note the existing `GET /:id` route and the Zod validation patterns.

- [ ] **Step 2: Add the `progress` route**

After the existing `GET /:id` route, add:

```ts
  app.get<{ Params: { id: string } }>('/api/audits/:id/progress', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const audit = await prisma.audit.findUnique({ where: { id: req.params.id } });
    if (!audit) return reply.code(404).send({ error: 'not found' });

    const pageAudits = await prisma.pageAudit.findMany({
      where: { auditId: audit.id },
      select: { status: true, url: true, projectPage: { select: { url: true } } },
    });
    const total = pageAudits.length;
    const completed = pageAudits.filter((p) => p.status === 'completed').length;
    const failed = pageAudits.filter((p) => p.status === 'failed').length;
    const skipped = pageAudits.filter((p) => p.status === 'skipped').length;
    const currentPages = pageAudits
      .filter((p) => p.status === 'running')
      .slice(0, 5)
      .map((p) => p.projectPage.url);

    return {
      status: audit.status,
      pagesTotal: total,
      pagesCompleted: completed,
      pagesFailed: failed,
      pagesSkipped: skipped,
      currentPages,
    };
  });
```

- [ ] **Step 3: Add the `delete` route (cancel)**

```ts
  app.delete<{ Params: { id: string } }>('/api/audits/:id', async (req, reply) => {
    const audit = await prisma.audit.findUnique({ where: { id: req.params.id } });
    if (!audit) return reply.code(404).send({ error: 'not found' });
    if (['completed', 'failed', 'cancelled'].includes(audit.status)) {
      return reply.code(409).send({ error: 'audit is terminal' });
    }
    await prisma.audit.update({
      where: { id: audit.id },
      data: { status: 'cancelled', finishedAt: new Date() },
    });
    return { id: audit.id, status: 'cancelled' };
  });
```

- [ ] **Step 4: Add tests**

In `apps/api/test/audits.test.ts`, after the existing tests, add:

```ts
  it.runIf(canRunDb)('GET /:id/progress returns 404 for unknown audit', async () => {
    const res = await app!.inject({ method: 'GET', url: '/api/audits/does-not-exist/progress' });
    expect(res.statusCode).toBe(404);
  });

  it.runIf(canRunDb)('DELETE /:id returns 409 for already-completed audit', async () => {
    // Create a project, an audit, mark it completed
    const proj = await app!.inject({
      method: 'POST', url: '/api/projects',
      payload: { name: 'cancel-test', domain: 'example.com' },
    });
    const { id: pid } = proj.json();
    const auditRes = await app!.inject({
      method: 'POST', url: '/api/audits',
      payload: { projectId: pid },
    });
    const { id: aid } = auditRes.json();
    // Mark it completed via prisma (test-only shortcut)
    const { prisma } = await import('../src/db.js');
    await prisma.audit.update({ where: { id: aid }, data: { status: 'completed' } });

    const res = await app!.inject({ method: 'DELETE', url: `/api/audits/${aid}` });
    expect(res.statusCode).toBe(409);
  });

  it.runIf(canRunDb)('DELETE /:id sets status=cancelled for a running audit', async () => {
    const proj = await app!.inject({
      method: 'POST', url: '/api/projects',
      payload: { name: 'cancel-running', domain: 'example.com' },
    });
    const { id: pid } = proj.json();
    const auditRes = await app!.inject({
      method: 'POST', url: '/api/audits',
      payload: { projectId: pid },
    });
    const { id: aid } = auditRes.json();

    const res = await app!.inject({ method: 'DELETE', url: `/api/audits/${aid}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: aid, status: 'cancelled' });
  });
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @jheo/api test audits`
Expected: 5+ tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/audits.ts apps/api/test/audits.test.ts
git commit -m "feat(api): audit progress + cancel routes"
```

---

## Task 7: Update web dashboard for progress + cancel

**Files:**
- Modify: `apps/web/src/api.ts` (add types + client functions)
- Modify: `apps/web/src/pages/ProjectDashboard.tsx` (wire progress + cancel)

- [ ] **Step 1: Add web types**

In `apps/web/src/api.ts`, add:

```ts
export type AuditProgress = {
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  pagesTotal: number;
  pagesCompleted: number;
  pagesFailed: number;
  pagesSkipped: number;
  currentPages: string[];
};

export async function getAuditProgress(auditId: string): Promise<AuditProgress> {
  const res = await fetch(`${apiUrl}/api/audits/${auditId}/progress`);
  if (!res.ok) throw new Error(`Failed to load progress: ${res.status}`);
  return res.json();
}

export async function cancelAudit(auditId: string): Promise<{ id: string; status: string }> {
  const res = await fetch(`${apiUrl}/api/audits/${auditId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to cancel: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: Add progress + cancel UI to `ProjectDashboard.tsx`**

Open the file (from Phase 2). In the audit list section (or create one if not present), add:

```tsx
import { cancelAudit, getAuditProgress } from '../api.js';

// In the component body:
const lastAudit = project.data.audits[0];
const progress = useQuery({
  queryKey: ['audit-progress', lastAudit?.id],
  queryFn: () => getAuditProgress(lastAudit!.id),
  enabled: Boolean(lastAudit) && (lastAudit?.status === 'queued' || lastAudit?.status === 'running'),
  refetchInterval: 2_000,
});

const cancel = useMutation({
  mutationFn: (auditId: string) => cancelAudit(auditId),
  onSuccess: () => {
    project.refetch();
    progress.refetch();
  },
});
```

In the JSX, after the health card, add:

```tsx
{lastAudit && (
  <div className="card">
    <h3>Last audit</h3>
    <p>Status: <strong>{lastAudit.status}</strong></p>
    {progress.data && (
      <>
        <p>
          {progress.data.pagesCompleted} / {progress.data.pagesTotal} pages completed
          ({progress.data.pagesFailed} failed, {progress.data.pagesSkipped} skipped)
        </p>
        {progress.data.currentPages.length > 0 && (
          <p>In progress: {progress.data.currentPages.join(', ')}</p>
        )}
        <div
          style={{
            height: '8px',
            background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-pill)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progress.data.pagesTotal ? (progress.data.pagesCompleted / progress.data.pagesTotal) * 100 : 0}%`,
              height: '100%',
              background: 'var(--accent)',
              transition: 'width 200ms ease',
            }}
          />
        </div>
      </>
    )}
    {(lastAudit.status === 'queued' || lastAudit.status === 'running') && (
      <button
        type="button"
        onClick={() => cancel.mutate(lastAudit.id)}
        disabled={cancel.isPending}
        style={{ marginTop: 'var(--space-3)' }}
      >
        {cancel.isPending ? 'Cancelling…' : 'Cancel audit'}
      </button>
    )}
  </div>
)}
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm typecheck && pnpm --filter @jheo/web run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/api.ts apps/web/src/pages/ProjectDashboard.tsx
git commit -m "feat(web): audit progress bar + cancel button"
```

---

## Task 8: End-to-end smoke test (Phase 3)

**Files:**
- Modify: `README.md` (Phase 3 smoke test section)

- [ ] **Step 1: Bring up the stack**

Run: `pnpm run compose:up`
Wait 10s for stack readiness.

- [ ] **Step 2: Create a project, trigger an audit, poll progress**

```bash
PROJ=$(curl -s -X POST http://127.0.0.1:8080/api/projects \
  -H 'content-type: application/json' \
  -d '{"name":"f5-3-smoke","domain":"example.com"}')
PID=$(echo "$PROJ" | jq -r .id)
AUDIT=$(curl -s -X POST http://127.0.0.1:8080/api/audits \
  -H 'content-type: application/json' \
  -d "{\"projectId\":\"$PID\"}")
AID=$(echo "$AUDIT" | jq -r .id)
echo "audit id: $AID"
for i in 1 2 3 4 5 6 7 8; do
  curl -s http://127.0.0.1:8080/api/audits/$AID/progress | jq .
  sleep 2
done
```

Expected: across the polls, `pagesCompleted` advances from 0 to N (where N is `pagesTotal`). Eventually `status` becomes `completed`.

- [ ] **Step 3: Test cancellation**

Create another audit, immediately cancel it:

```bash
AUDIT2=$(curl -s -X POST http://127.0.0.1:8080/api/audits \
  -H 'content-type: application/json' \
  -d "{\"projectId\":\"$PID\"}")
AID2=$(echo "$AUDIT2" | jq -r .id)
sleep 1
curl -s -X DELETE http://127.0.0.1:8080/api/audits/$AID2 | jq .
sleep 5
curl -s http://127.0.0.1:8080/api/audits/$AID2 | jq .status
```

Expected: `DELETE` returns `{id, status: "cancelled"}`. After 5s, `GET /:id` returns `status: "cancelled"`.

- [ ] **Step 4: Update README**

In `README.md`, add:

````markdown
### Parallel audit + cancel (F5.3)

```bash
PID=<project-id>
AUDIT=$(curl -s -X POST http://127.0.0.1:8080/api/audits \
  -H 'content-type: application/json' \
  -d "{\"projectId\":\"$PID\"}")
AID=$(echo "$AUDIT" | jq -r .id)
# Poll progress
for i in 1 2 3 4 5; do curl -s http://127.0.0.1:8080/api/audits/$AID/progress | jq .; sleep 2; done
# Cancel
curl -s -X DELETE http://127.0.0.1:8080/api/audits/$AID | jq .
```

Expected: `pagesCompleted` advances; `DELETE` returns `status: "cancelled"`; the audit halts within ≤ 5s.
````

- [ ] **Step 5: Commit + tear down**

```bash
git add README.md
git commit -m "docs: F5.3 smoke test for parallel + cancel"
pnpm run compose:down
```

---

## Self-Review Checklist

- [ ] Schema migration includes `Project.maxPages`, `PageAudit`, `Finding.pageAuditId` (backfilled, then NOT NULL), `Finding.previousFindingId`
- [ ] Backfill creates synthetic `ProjectPage` + `PageAudit` per pre-Phase-3 `Audit`; `Finding.pageAuditId` becomes NOT NULL with no orphans
- [ ] `audit-job.ts` refactored: discovery → fan-out via Flow Producer (or polling fallback) → aggregate `PageAudit`s → close `Audit`
- [ ] `auditPageQueue` worker registered in `server.ts` with `JHEO_AUDIT_PAGE_CONCURRENCY`
- [ ] `runPageAuditJob` is idempotent and checks cancellation at start
- [ ] `GET /:id/progress` returns `{status, pagesTotal, pagesCompleted, pagesFailed, pagesSkipped, currentPages}`
- [ ] `DELETE /:id` sets `cancelled`; returns 409 on terminal
- [ ] Web dashboard shows progress bar and cancel button
- [ ] All tests pass; typecheck clean; smoke test confirms parallel execution + cancellation
- [ ] Each task is its own commit
