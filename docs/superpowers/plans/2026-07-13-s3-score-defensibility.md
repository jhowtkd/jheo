# S3 — Score Defensibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the audit score client-call-defensible: versioned formula, frozen snapshots, evidence on findings, vs-last/sparkline, real page counts, translated category labels.

**Architecture:** Core-first. Rewrite `scoreFindings` in `@jheo/core` with weights, info-neutral, page normalization, error curve, and `SCORE_ENGINE_VERSION`. Persist extended `Audit.score` JSON on completion. Lazy-backfill legacy scores on read. Then ScoreCard + FindingList + AuditResults/Dashboard wiring. No Prisma migration unless unavoidable (keep version inside JSON).

**Tech Stack:** TypeScript packages/core, Fastify + Prisma, React, Vitest, i18next. SI tokens only.

**Spec:** `docs/superpowers/specs/2026-07-13-s3-score-defensibility-design.md`

**Out of scope:** C4 CWV browser warning, executive report redesign, sidebar, telemetry, design-system invention.

---

## File Structure

**Create / extend tests:**
- `packages/core/test/audit-score.test.ts` — expand golden fixtures
- `apps/api/test/` — backfill + completion snapshot assertions (extend audits or new focused test)
- `apps/web/test/scorecard.test.tsx` — vs-last, sparkline, tooltips
- `apps/web/src/components/__tests__/FindingList.test.tsx` — evidence always visible

**Modify:**
- `packages/core/src/audit/score.ts` — engine v2
- `packages/core/src/audit/orchestrator.ts` — pass pageCount if needed
- `apps/api/src/jobs/audit-job.ts` — `completeAuditFromPageScores` (or findings rollup) writes snapshot + version + pagesWithError
- `apps/api/src/routes/audits.ts` — lazy backfill helper on GET by id
- `apps/api/src/routes/projects.ts` — health may expose previous overall / history sparklines **or** Dashboard derives from `project.audits` (prefer derive on client if audits already loaded)
- `apps/web/src/components/ScoreCard.tsx` — badge, sparkline, i18n labels/tooltips, pages row if useful
- `apps/web/src/components/FindingList.tsx` — evidence block
- `apps/web/src/pages/AuditResults.tsx` — real pagesTotal/pagesWithError; pass history/previous
- `apps/web/src/pages/ProjectDashboard.tsx` — pass history/previous into ScoreCard
- `apps/web/src/api.ts` — types for score snapshot fields
- `apps/web/src/i18n/en.json` + `pt-BR.json`

---

### Task 1: Score engine v2 (C1)

**Files:** `packages/core/src/audit/score.ts`, `packages/core/test/audit-score.test.ts`

- [ ] **Step 1: Failing / extended tests** covering at least:
  - empty findings → all categories `null`, overall `null` (not 100)
  - `info`-only findings → category present but score 100 (or null-vs-present: prefer category **present** at 100 with zero penalty)
  - pageCount=10 vs pageCount=1: same findings → higher score when pageCount larger
  - weighted overall uses CATEGORY_WEIGHTS (seed two categories with known penalties)
  - error curve: many errors degrade slower than pure linear `7 * n` after first few (document expected numbers in test)
  - exports `SCORE_ENGINE_VERSION === '2'`

- [ ] **Step 2: Implement**

```ts
export const SCORE_ENGINE_VERSION = '2';
export const CATEGORY_WEIGHTS = {
  seo: 0.25,
  cwv: 0.20,
  geo: 0.25,
  a11y: 0.15,
  content: 0.15,
} as const;
```

Suggested penalty model (document in file header if tweaked):
- Walk findings per category; ignore `info` for penalty.
- Warnings: `+3` each (after `/ pageCount` at category or global normalize — pick **divide total raw penalty by max(pageCount,1)** once per category).
- Errors: for the k-th error in that category (1-indexed), add `7 * (k ** 1.2)` to raw, then `/ pageCount`.
- Category score = `clamp(0, 100 - penalty)`.
- Overall = weighted mean of non-null category scores using `CATEGORY_WEIGHTS` renormalized over present categories only.

- [ ] **Step 3:** Update orchestrator call sites if signature gains `opts`.
- [ ] **Step 4:** `pnpm --filter @jheo/core test` (or package vitest path) green.
- [ ] **Step 5: Commit** `feat(core): score engine v2 with weights, curve, page normalize`

---

### Task 2: Persist snapshot on audit completion

**Files:** `apps/api/src/jobs/audit-job.ts` (+ any page-score writers)

- [ ] **Step 1:** Prefer audit rollup from **all findings** for completed pageAudits via `scoreFindings(all, { pageCount })`, then merge `pagesAudited`, `pagesTotal`, `pagesWithError` (count failed pageAudits), `scoreEngineVersion: SCORE_ENGINE_VERSION`.
- [ ] **Step 2:** If full findings rollup is too heavy for this task, document fallback: average page scores **but still** apply category weights when combining `byCategory` and write `scoreEngineVersion`. Prefer findings rollup.
- [ ] **Step 3:** Keep `PageAudit.score` as page-local `scoreFindings(pageFindings, { pageCount: 1 })` for page UI consistency.
- [ ] **Step 4:** Unit/integration assertion in API test or job test that completed audit JSON includes `scoreEngineVersion: '2'`.
- [ ] **Step 5: Commit** `feat(api): persist score engine v2 snapshot on audit complete`

---

### Task 3: Lazy backfill on read

**Files:** `apps/api/src/routes/audits.ts` (helper module ok: `apps/api/src/services/score-backfill.ts`)

- [ ] **Step 1:** `ensureScoreSnapshot(audit)`:
  - if status !== completed or score already has `scoreEngineVersion` → return as-is
  - else load findings for audit, recompute, `update` score with version + `recomputedAt`
- [ ] **Step 2:** Call from `GET /api/audits/:id` before respond.
- [ ] **Step 3:** Test with fixture audit score missing version → after GET, DB has version + recomputedAt.
- [ ] **Step 4: Commit** `feat(api): lazy-backfill legacy audit scores on read`

---

### Task 4: ScoreCard — vs-last, sparkline, i18n (C2 + D2)

**Files:** `apps/web/src/components/ScoreCard.tsx`, `apps/web/test/scorecard.test.tsx`, i18n

- [ ] **Step 1:** Extend props:

```ts
interface ScoreCardProps {
  health: ProjectHealth | null | undefined;
  previousOverall?: number | null;
  history?: number[]; // oldest → newest, max 5
  recomputed?: boolean;
}
```

- [ ] **Step 2:** Badge: if `previousOverall` is number and `health.overall` is number, show delta ↑/↓/= with i18n.
- [ ] **Step 3:** Sparkline when `history.length >= 2`.
- [ ] **Step 4:** Category label via `t('score.category.seo')` etc. + `title`/HelpTip tooltip keys `score.category.seoHint`.
- [ ] **Step 5:** Show `recomputed` chip when true.
- [ ] **Step 6:** Tests for badge sign and category translation key presence.
- [ ] **Step 7: Commit** `feat(web): ScoreCard vs-last, sparkline, category i18n`

---

### Task 5: Wire Dashboard + Audit Results (C2 + C5)

**Files:** `ProjectDashboard.tsx`, `AuditResults.tsx`, `api.ts` types

- [ ] **Step 1:** From project audits (completed, ordered), compute `history` (last 5 overalls) and `previousOverall` for current.
- [ ] **Step 2:** AuditResults: stop hardcoding `pagesTotal: 0`, `pagesWithError: 0` — use `a.score.pagesTotal`, `a.score.pagesWithError` (fallback query/count only if missing).
- [ ] **Step 3:** Pass `recomputed={Boolean(a.score?.recomputedAt)}` when available.
- [ ] **Step 4:** Smoke component tests or extend existing page tests if cheap.
- [ ] **Step 5: Commit** `feat(web): wire score history and real page counts into ScoreCard`

---

### Task 6: FindingList evidence always-on (C3)

**Files:** `FindingList.tsx`, FindingList test

- [ ] **Step 1:** If `Object.keys(evidence).length > 0`, render `<dl>` or list of entries under the message (always expanded).
- [ ] **Step 2:** Stringify non-primitives; truncate very long strings (e.g. 500 chars) with ellipsis.
- [ ] **Step 3:** Test: finding with evidence shows key text; empty evidence does not render evidence region.
- [ ] **Step 4: Commit** `feat(web): always-visible finding evidence disclosure`

---

### Task 7: i18n parity + acceptance gate

- [ ] **Step 1:** All new keys in `en.json` and `pt-BR.json`; run web parity test.
- [ ] **Step 2:**

```bash
pnpm --filter @jheo/core test
pnpm --filter @jheo/web test
pnpm --filter @jheo/web typecheck
# API: at least score backfill / audits tests that can run
```

- [ ] **Step 3: Manual**
  1. Warm stack; run audit on a real project.
  2. Dashboard: translated categories, vs-last (after 2nd audit), sparkline.
  3. Audit Results: real pages counts; findings show evidence.
  4. Re-open a pre-S3 audit (or strip `scoreEngineVersion` in DB) → recomputed badge once.

- [ ] **Step 4: Commit** if only i18n leftovers, else mark S3 complete in progress notes (do not commit `.superpowers` unless repo tracks it).

**Done when** manual gate passes and automated tests green.

---

## Spec coverage

| Spec item | Task(s) |
|-----------|---------|
| C1 formula + version constant | 1 |
| Snapshot on complete | 2 |
| Lazy backfill + recomputed | 3 |
| vs-last + sparkline + D2 | 4, 5 |
| C5 real pages | 5 |
| C3 evidence | 6 |
| Acceptance | 7 |

## Implementation notes

- **Error curve:** implement as specified in Task 1; if golden numbers feel absurd on one real site, adjust exponent only with test updates and a short commit note — do not invent a second engine.
- **Health API:** prefer client-derived history from audits already fetched on Dashboard to avoid new endpoints unless necessary.
- **Executive report:** may keep consuming `overall` / `byCategory`; do not redesign it in S3. If report breaks on `overall: null`, coerce display to "—" only.
