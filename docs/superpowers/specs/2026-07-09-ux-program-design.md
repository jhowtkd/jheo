# JHEO UX Program — Design (umbrella)

- **Date:** 2026-07-09
- **Status:** Amended — sequence and SI boundaries in `2026-07-11-ux-impeccable-hybrid-design.md`
- **Kind:** Program-level umbrella. Scopes and sequences milestones. Implements nothing.
- **Source audit:** `docs/ux-audit-2026-07-09.md` (24 problems, 4 tracks: Stack / UX / Veracidade / Polish)
- **Baseline:** clean tree at `2c3d289` (in-flight B10/B11 + i18n fixes committed before this program started)
- **Amendment (2026-07-11):** Inserts Impeccable milestone **SI** between S1 and S2. Authoritative sequence: `S0 → S1 → SI → S2 → S3 → S4`. See `docs/superpowers/specs/2026-07-11-ux-impeccable-hybrid-design.md`.

## TL;DR

The audit's diagnosis is "the gap is UX, not engineering." The architecture (audit → generate → publish, F1–F7 shipped, 26 plugins, Flow Producer) is sound; the surface is not. This program turns the audit's 24 issues into sequenced milestones, each ending in something demoable end-to-end. **Sequence was amended 2026-07-11** to insert SI (Impeccable foundations) after S1; use that doc for order and SI scope. Per-milestone brainstorm/spec/plan/implementation cycles follow; S0–S4 ownership detail below remains except where the amendment overrides.

Three decisions shaped the original program (made during brainstorming):
1. **Strict sequence** (originally S0 → S1 → S2 → S3 → S4; now **S0 → S1 → SI → S2 → S3 → S4**) — the audit's claim that sprints are "independent and parallelizable" conflicts with its own "Sprint 1 unblocks everything" note. Sequence resolves that.
2. **Extract shared foundations first** (Sprint 0) — three primitives recur across 3–4 milestones; build once, consume everywhere.
3. **Score defensibility via full transparency** — every score point traces to evidence a user can open. This is more ambitious than the audit's "fix the math" and is why Sprint 3 owns C1+C2+C3 fused, not C1 alone.

## What this document is and isn't

**Is:** the contract for each milestone — what it owns, what it does not own, its acceptance criterion, and how it depends on the others. A later brainstorming round cannot quietly expand a milestone without flagging the change against the boundaries defined here.

**Isn't:** an implementation plan. The score formula's constants, the sidebar's exact 7 items, the `dev-up` script's internals, the empty-state copy — all deferred to each milestone's own spec. This umbrella fixes only *what each milestone owns and in what order*.

## Program shape

Five milestones. S0 is a thin (~1–2 day) foundations milestone; S1–S4 correspond to the audit's four sprints. Each gets its own spec → plan → implementation cycle.

| Milestone | Name | Audit items | Layer | Done = |
|---|---|---|---|---|
| **S0** | Shared foundations | client side of A2; root cause of B4/B5/D8 | web infra | the three shared primitives exist, tested, each consumed by one page as a reference integration |
| **S1** | "A ferramenta liga" | A1, A2, A3, A4, B4, B5 | stack + dev bootstrap | user runs `bin/dev-up`, stack is up in <2 min, every API failure shows a human message |
| **S2** | "Consigo usar sem perguntar" | B1, B2, B3, B6, B7, B8, B9, D1 | UI surfaces | a new user walks create→audit→generate→publish with no doc and no dead-ends |
| **S3** | "O número é defensável" | C1, C2, C3, C5, D2 | score engine + transparency | every score point traces to evidence; the math is normalized and weighted |
| **S4** | "Parece ferramenta" | B10-tail, B11-tail, D3, D4, D5, D6, D7, C4 | polish + observability | first-time user reads "product", not "prototype" |

### Why S0 is separate and first

Three primitives recur across 3–4 milestones. Building them inside Sprint 1 forces Sprint 2/3/4 to either re-import or re-implement. Extracting them once, with a reference integration on one page each, means Sprint 1 just *consumes* them everywhere. S0 is intentionally thin so it doesn't become a gate.

### Why S3 is third, not last

The transparency-led scoring decision changes what Sprint 2 builds — empty states and finding surfaces need to know that evidence is coming. If S3 ran last, S2 would ship finding UIs that S3 then rips out. Sequencing S3 before S4 (polish) avoids that rework; S4 polish sits on a stable number.

### B10/B11 split

Already half-shipped in baseline commit `2c3d289` (the `FixGroup` grouping work closes the substantive half of B10 and the contextual-empty-state half of B11). The remaining tails land later: B10's "why this matters" plugin-doc link → S4; B11's illustration + final copy → S4. Each milestone's scope notes this so it isn't double-counted.

## Per-milestone scope (boundary contract)

### S0 — Shared foundations

**Builds:**
- `humanError(err)` — maps fetch/JSON-parse/proxy errors → localized strings. Closes the B5/D8 root cause for all consumers. Pure, locale-aware (i18next), never throws.
- `<EmptyState>` + `<ErrorState>` — one reusable presentational pair with a CTA slot. The primitive B1/B2/B3/B11 each specialize. Locale-driven.
- `useBackendReachable()` — React-Query-backed health hook returning `{ reachable, retryInMs, lastCheckedAt }`. Polls `/api/health` with exponential backoff. Backs the A2 retry UX and replaces A4's naive constant `refetchInterval`.

**Does not:** re-skin specific pages (S2), change the score (S3), touch Docker (S1).

**Reference integrations:** one page each — `humanError` on project-create, `ErrorState` on ProjectsList, the hook on ProjectDashboard — so S1+ consume a proven API, not a guess.

**Done =** the three primitives exist, are unit-tested, and each has one working in-app consumer.

### S1 — "A ferramenta liga" (Stack + error honesty)

**Builds:**
- `bin/dev-up` bootstrap [A1]: Docker-health loop → `compose up` → wait for `/api/health` 200 → idempotent `prisma db push`. Best-effort with clear fallback messaging.
- Vite proxy `selfHandleResponse` returning 503 `{error:'backend_unavailable'}` + `Retry-After` when the backend is down [A2] — kills the empty-500 → "Unexpected end of JSON input" chain.
- Versioned `docker/.env` completeness + idempotent `prisma db push` in the Dockerfile [A3].
- `useBackendReachable`-driven throttled polling: exponential backoff instead of constant 5s [A4].
- Rollout of `humanError` across all mutation/query error surfaces [B4, B5].

**Does not:** add empty-state CTAs to untouched pages (S2), change the sidebar (S2), change the score (S3).

**Done =** user runs `bin/dev-up`, opens `http://127.0.0.1:5173`, sees "API conectada", creates a project and runs a basic audit in under 2 minutes — and every API failure the user can hit shows a human message, never a raw technical string.

### S2 — "Consigo usar sem perguntar" (Surfaces)

**Builds:**
- `<EmptyState>`/`<ErrorState>` applied to Templates, Settings, Projects lists [B1, B2, B3].
- Client-side URL validation + aligned domain/URL contract between input placeholder, label, and backend [B6].
- AuditRunner config form: maxPages default (50), source filters (sitemap/crawl/root), page preview, rough ETA [B7].
- Generate-button disabled-hint ("you need an active template before generating") [B8].
- Audit progress ETA (rolling avg pages/sec) [B9].
- 7-item sidebar + global `/audits` showing recent audit runs [D1].

**Does not:** change what findings display beyond current (S3 owns evidence), add dark mode (S4).

**Constraint:** finding-list rendering S2 ships must be additive only — it leaves room for S3's evidence disclosure without rework.

**Done =** a new user opens the tool, follows the visual flow without reading docs, and reaches "published to WordPress" (or the equivalent publish target) solo.

### S3 — "O número é defensável" (Score + transparency)

**Builds:**
- Rewrite `score.ts` [C1]: page-normalized penalty (penalty / pageCount), category weights (SEO 0.25, CWV 0.20, GEO 0.25, A11y 0.15, Content 0.15 — exact values decided in S3's spec), null (category didn't run) shown as `—` with tooltip "Plugin não rodou" instead of dropped from the mean, info severity non-penalizing, sub-linear curve (e.g. `error^1.2`) so one error doesn't tank a category.
- Per-finding **evidence + rationale** disclosure in FindingList (collapsible) + "why this matters" plugin-doc link [C3 + B10-tail].
- ScoreCard "vs last audit" badge (↑5 / ↓3 / =0) + last-5 sparkline [C2].
- AuditResults passes real `pagesTotal`/`pagesWithError` to ScoreCard, not hardcoded zeros [C5].
- Translated category labels + sigla tooltips in ScoreCard [D2].

**Does not:** add telemetry (S4), dark mode (S4), new audit categories or exportable reports (deferred to a future program — scope guard).

**Note:** this is where the "defensibility via transparency" decision lands. Heaviest milestone because C1+C3+C2 fuse into one coherent "show your work" system.

**Done =** user can print the dashboard and take it to a client meeting without needing to explain what CWV is or why the number is 87 — every point is traceable to evidence.

### S4 — "Parece ferramenta" (Polish + observability)

**Builds:**
- Fixes empty-state illustration + final copy [B11-tail].
- Sidebar label clarity + category-coverage tooltips [D3, D4].
- Localized routes `/projetos`, `/modelos`, etc. **with redirects** from old paths [D5] — optional, droppable.
- Footer "uso único" explanation ("esta instância roda só pra você — sem login, sem sync na nuvem") [D6].
- Dark/light toggle persisted in localStorage [D7].
- CWV-needs-browser warning in AuditRunner ("instale Chromium se rodando fora do Docker") [C4].
- Basic no-PII telemetry: click counts, time-on-page, per-endpoint error rate [audit's telemetry bullet].

**Does not:** reopen score math or finding evidence (S3's contract).

**Done =** a first-time user opens the tool and says "ok, this is a product" rather than "this is a prototype."

## Dependency chain

```
S0 ──► S1 ──► S2 ──► S3 ──► S4
```

- **S0→S1 (hard):** S1's "every API failure shows a human message" *is* the `humanError` rollout. Without S0, S1 reinvents it inline and S2/S3 inherit divergent copies.
- **S1→S2 (soft but strong):** S2's "no dead-ends" promise can't be verified while the API is down and errors leak technical strings. S1 must land so S2's acceptance test is runnable.
- **S2→S3 (soft):** S2 ships finding-list rendering; S3 extends it with evidence. Sequencing means S3 edits an existing stable surface rather than rebuilding it.
- **S3→S4 (soft):** S4's tooltips/labels sit on S3's category translations and score shape. Polish last, on a frozen target.

No parallel branches. The one place parallelism looked possible (S2 surfaces vs S3 engine) is ruled out by the transparency decision — S2's finding UI and S3's evidence UI are the same surface.

## Shared-foundations contract

Each S0 primitive gets a typed interface frozen at S0 close. Later milestones consume the interface; changes require a program-level decision, not a quiet edit.

| Primitive | Interface (frozen in S0) | Consumers |
|---|---|---|
| `humanError` | `(err: unknown) => { title: string; detail?: string; retry?: boolean }` — pure, locale-aware, never throws | S1, S2, S3, S4 |
| `<EmptyState>` / `<ErrorState>` | presentational; props `{ kind?, title, cta?, onRetry?, hint? }`; locale-driven | S2, S4 |
| `useBackendReachable` | `() => { reachable: boolean; retryInMs: number; lastCheckedAt: Date }`; React Query backed, polls `/api/health`, exponential backoff | S1, S2, S3, S4 |

## Cross-cutting rules

1. No milestone edits `score.ts` except S3.
2. No milestone restructures the sidebar except S2 (S4 only edits labels/tooltips on S2's structure).
3. Every new user-facing string ships in both `en.json` and `pt-BR.json` (baseline established in `2c3d289`).
4. Each milestone ends with its acceptance criterion demoable end-to-end — no "mostly done."

## Risk register

1. **Docker-state diagnosis is environment-specific (A1).** `bin/dev-up` may not fix every way Docker Desktop breaks. *Mitigation:* S1 defines the script as best-effort with a "couldn't auto-fix, here's what to do" fallback, not a guarantee. Acceptance is "works on a healthy-but-stopped Docker," not "revives a corrupted install." *Owner: S1.*
2. **Score rewrite silently changes every historical number (C1).** Re-running `scoreFindings` with new math moves old audit scores. *Mitigation:* S3 stores the score-engine version on each audit and can show "scored under v2" context; acceptance includes a before/after diff on a real audit so the change is visible. *Owner: S3.*
3. **`selfHandleResponse` proxy change can break the one working path (A2).** Touching the vite proxy risks breaking the dev server mid-S1. *Mitigation:* S1 specs it behind a feature check and tests the 200-path (backend up) as hard as the 503-path. *Owner: S1.*
4. **Localized routes (D5) break existing bookmarks/links (S4).** Changing `/projects` → `/projetos` breaks deep links. *Mitigation:* S4 ships redirects from old→new paths; this item is explicitly **optional** in S4 and can be dropped if the cost outweighs the polish value. *Owner: S4.*
5. **Scope creep in S3.** C1+C2+C3+C5+D2 is already the heaviest milestone; "while we're here" additions will bloat it. *Mitigation:* S3's spec hard-caps scope to the five items; anything else is explicitly deferred to a future program. *Owner: S3.*

## Open questions deferred to milestone specs

- **S1:** whether `bin/dev-up` is a shell script or a small Node script (shell = lower ceremony, worse on Windows/CI; Node = portable, adds a runtime dep). S1's brainstorm decides.
- **S2:** the sidebar's exact 7 items and the `/audits` page's shape. S2's brainstorm decides.
- **S3:** the exact category weight constants and curve exponent. S3's brainstorm decides.
- **S3:** score-engine versioning scheme (how "scored under v2" is stored and displayed). S3's brainstorm decides.

## Next step

Follow `2026-07-11-ux-impeccable-hybrid-design.md`: verify/close S0 if needed → S1 → **SI (teach first)** → S2 → S3 → S4, each through its own brainstorm/spec/plan cycle.
