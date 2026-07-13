# S3 — "O número é defensável" (Design)

- **Date:** 2026-07-13
- **Status:** Draft — awaiting user review
- **Kind:** Milestone spec under the UX program
- **Umbrella:** `docs/superpowers/specs/2026-07-09-ux-program-design.md`
- **Amendment:** `docs/superpowers/specs/2026-07-11-ux-impeccable-hybrid-design.md`
- **Audit items:** C1, C2, C3, C5, D2
- **Baseline:** S2 complete (surfaces/IA); SI tokens + ScoreCard craft available

## TL;DR

S3 makes the score survivable in a client call: rewrite the scoring engine with a documented, versioned formula; freeze the breakdown on each completed audit; lazy-backfill legacy audits; show vs-last + sparkline on Dashboard and Audit Results; always show finding evidence when present; wire real page counts into ScoreCard; translate category labels with tooltips.

## Decisions (brainstorming)

1. **Monolithic S3** — C1+C2+C3+C5+D2 in one delivery (not S3a/S3b).
2. **Formula (A):** accept the UX-audit proposal:
   - Category weights: SEO 0.25 · CWV 0.20 · GEO 0.25 · A11Y 0.15 · Content 0.15
   - `info` does **not** penalize (counts as finding only)
   - Normalize penalties by `pageCount`
   - Non-linear error accumulation: each error contributes `7 * (errorOrdinal ^ 1.2)` or equivalent documented curve so one error does not dominate like flat linear caps
   - Category with no findings / not run → `null` shown as "—", **excluded** from overall weighted mean
   - If **all** categories are `null` → overall is `null` (not fake 100)
3. **Versioning (A):** on audit completion, persist `scoreEngineVersion` + full score snapshot on `Audit.score` JSON; UI reads the snapshot (no live recompute for completed audits under normal path).
4. **vs-last + sparkline (B):** Project Dashboard **and** Audit Results.
5. **Evidence (C):** always expanded on each finding when `evidence` is non-empty; no accordion; omit the block when empty.
6. **Legacy audits (A):** on read, if snapshot lacks `scoreEngineVersion`, recompute with current engine, persist snapshot, surface a small **"recomputed"** badge.
7. **Approach:** core-first (engine + persistence + backfill), then UI transparency.

## What this milestone is and isn't

**Is:** `packages/core` score rewrite; audit score snapshot contract; lazy backfill; ScoreCard density (vs-last, sparkline, pages, i18n categories); FindingList evidence disclosure; AuditResults real page metrics.

**Isn't:** CWV browser warning (C4 → S4); design-token changes; sidebar IA; executive-report visual redesign; telemetry; dual-engine feature flags.

## Score contract

### Engine (`packages/core/src/audit/score.ts`)

Export:

- `SCORE_ENGINE_VERSION` — string constant (start at `"2"`; v1 = pre-S3 implicit).
- `CATEGORY_WEIGHTS` — frozen map matching decision (2).
- `scoreFindings(findings, opts?: { pageCount?: number })` — `pageCount` defaults to `1` for single-page scoring.
- Documented helpers for severity contribution (warning fixed weight; error uses curve; info → 0 penalty).

**Audit-level rollup** (preferred): when finalizing an audit, score from **all findings** across completed page audits with `pageCount = pagesAudited` (or pages that contributed findings — plan must pick one and test it). Page-level `PageAudit.score` may remain page-local (`pageCount: 1`) for per-page UI.

**Do not** silently average unequally weighted category means without applying `CATEGORY_WEIGHTS`.

### Snapshot shape (`Audit.score` JSON)

Extend (additive) the existing score object:

```ts
{
  overall: number | null;
  byCategory: Partial<Record<Category, number | null>>;
  pagesAudited: number;
  pagesTotal: number;
  pagesWithError?: number;
  discoveryLimitReached?: boolean;
  scoreEngineVersion: string;
  recomputedAt?: string; // ISO, set only by lazy backfill
}
```

No Prisma schema change required if everything stays inside `score Json?`. Optional column is **out of scope** unless implementers hit a hard type/query need (YAGNI).

### Lazy backfill

Trigger on authenticated/local read paths that return a completed audit score (at least `GET /api/audits/:id` and project health if it exposes the last audit). Idempotent: if `scoreEngineVersion` present, skip. Set `recomputedAt` when rewriting. Concurrent backfills: last write wins; acceptable for single-user.

## UI contract

### ScoreCard

- Show overall + category rows with **translated labels** + **tooltip** explaining SEO / CWV / GEO / A11Y / Content (D2).
- `null` category → "—" and muted bar (already partial); tooltip when null: "category not scored / no findings" (i18n).
- Optional props: `previousOverall`, `history: number[]` (last ≤5 overalls, oldest→newest), `recomputed?: boolean`.
- **vs-last badge:** ↑ / ↓ / = with delta points when `previousOverall` is a number.
- **Sparkline:** tiny inline SVG or CSS bars for `history`; hide if &lt; 2 points.
- Wire **pagesAudited / pagesTotal / pagesWithError** when provided (C5) — stop hardcoding zeros on Audit Results.

### FindingList (C3)

- For each finding, if `evidence` has keys, render an always-visible evidence block (readable `key: value` / nested JSON stringify for objects).
- No "why it matters" external link required in S3 (deferred unless a stable plugin doc URL already exists — YAGNI).
- Empty evidence → no evidence UI.

### Surfaces

| Surface | ScoreCard extras |
|---------|------------------|
| Project Dashboard | vs-last vs previous completed audit; sparkline from last ≤5 completed; health pages already mostly real — verify |
| Audit Results | same vs-last/sparkline relative to prior completed audit on same project; **fix pagesTotal / pagesWithError** from audit score + DB counts as needed |

## Out of scope (explicit)

| Item | Owner |
|------|--------|
| C4 CWV Chromium warning | S4 |
| Executive report layout/theme | S4 / later |
| Changing SI tokens | never in S3 |
| Sidebar structure | frozen by S2 |
| Telemetry | S4 |

## Cross-cutting rules

1. Only S3 edits `score.ts` scoring math (program rule).
2. Every new string in `en.json` + `pt-BR.json`.
3. Consume SI tokens; no new palette.
4. Completed audits display snapshot scores; do not recompute on every render after versioned.

## Testing and acceptance

| Gate | How |
|------|-----|
| Unit | Golden fixtures for `scoreFindings` (info-neutral, page normalize, weights, all-null overall, curve vs linear) |
| Unit/API | Completion writes `scoreEngineVersion`; GET backfills legacy row once |
| Component | ScoreCard badge/sparkline/tooltips; FindingList evidence visible; AuditResults non-zero pages when data present |
| Manual | Real audit: print Dashboard + Results for a client call — every non-empty finding shows evidence; vs-last readable; categories translated |

**Done =** user can defend the number in a meeting without explaining raw penalties or English category codes.

## Risk register

1. **Score discontinuity** after v2 — clients see jumps on recompute. *Mitigation:* `recomputed` badge + keep snapshot thereafter. *Owner: S3.*
2. **Curve/weight tuning feels wrong** on real sites. *Mitigation:* formula frozen for S3; tune only if golden + one real audit clearly absurd; document in commit. *Owner: S3.*
3. **Evidence JSON ugly/noisy.** *Mitigation:* always-on was an explicit choice (C); format keys humanely, truncate huge values. *Owner: S3.*
4. **Audit rollup vs page average mismatch** with old mental model. *Mitigation:* document in PRODUCT/DESIGN note or score module comment; prefer findings+pageCount rollup. *Owner: S3.*

## Open questions deferred to implementation plan

- Exact error-curve implementation (per-finding `7 * n^1.2` vs category-level).
- Whether `pagesWithError` lives on snapshot at complete time or is queried live for ScoreCard.
- Sparkline data source: project audits list already on Dashboard vs small dedicated fields on health API.

## Next step

User reviews this spec → writing-plans → implement. Then S4.
