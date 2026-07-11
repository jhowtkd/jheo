# JHEO UX Program — Hybrid Impeccable Amendment

- **Date:** 2026-07-11
- **Status:** Draft — awaiting user review
- **Kind:** Program-level amendment. Extends `2026-07-09-ux-program-design.md`. Implements nothing.
- **Source audit:** `docs/ux-audit-2026-07-09.md`
- **Prior umbrella:** `docs/superpowers/specs/2026-07-09-ux-program-design.md` (S0–S4 scopes remain unless this doc overrides them)
- **Impeccable:** register *product*; skills `teach` → `document`/`DESIGN.md` + tokens → `shape` → `craft` → later `critique` / `polish` inside SI and S4

## TL;DR

Keep the audit-driven UX program (S0→S4), but insert a full Impeccable milestone **SI** after stack honesty (S1) and **before** surface work (S2). SI establishes product context and a design language from a real use scene, freezes tokens in code, and proves them by redesigning **Project Dashboard** only. S2–S4 then consume that language instead of inventing look-and-feel mid-flight.

**Program acceptance (unchanged north star, made explicit):** a consultant can run create→audit→generate→publish without dead-ends, defend every score point with evidence, and present the product on a client call without apologizing for the UI.

## Decisions (this brainstorm)

1. **Hybrid, not replacement** — S0–S4 stay; SI is inserted, not a parallel redesign program.
2. **Sequence:** `S0 → S1 → SI → S2 → S3 → S4` (no parallel branches).
3. **SI depth:** `PRODUCT.md` + `DESIGN.md` + CSS tokens + **one** reference surface (Project Dashboard).
4. **Visual baseline:** restart via `teach` (do not formalize the current dark/emerald/Inter CSS as destiny). Tokens may diverge from today's `styles.css`.
5. **Use scene for teach:** solo consultant, afternoon, large monitor, presenting score to a client in the same session.
6. **Approach:** SI is a complete milestone (docs + tokens + Dashboard craft), not a docs-only gate.

## What this document is and isn't

**Is:** the amended program contract — sequence, SI boundaries, how S2–S4 change under SI, acceptance and risks. Source of truth for *order* and *SI scope* going forward.

**Isn't:** an implementation plan; the teach interview answers; exact color tokens; Dashboard wireframes; S1/S2/S3/S4 task breakdowns. Those belong in each milestone's own brainstorm → spec → plan cycle. SI's first implementation step is `teach`, which produces `PRODUCT.md`.

## Program shape (amended)

| Milestone | Name | Layer | Done = |
|---|---|---|---|
| **S0** | Shared foundations | web infra | three primitives exist, tested, one real consumer each (verify if already shipped; do not rebuild) |
| **S1** | "A ferramenta liga" | stack + error honesty | `dev-up` → healthy API → project + basic audit in &lt;2 min; every user-visible API failure is a human message |
| **SI** | Impeccable foundations | product context + design language | `PRODUCT.md` + `DESIGN.md`; tokens in CSS; Project Dashboard redesigned and demoable in the consultant scene; umbrella stay in sync |
| **S2** | "Consigo usar sem perguntar" | UI surfaces | new user walks create→audit→generate→publish with no doc and no dead-ends, on SI tokens |
| **S3** | "O número é defensável" | score + transparency | every score point traces to evidence; math normalized/weighted and versioned |
| **S4** | "Parece ferramenta" | polish + observability | first-time / client-call user reads "product", not "prototype"; polish sits on SI language + S3 numbers |

### Dependency chain

```
S0 ──► S1 ──► SI ──► S2 ──► S3 ──► S4
```

- **S0→S1 (hard):** S1's human-error rollout *is* the `humanError` / reachability consumption story.
- **S1→SI (hard):** Design language work assumes a stack that boots and errors that do not look broken; SI acceptance demos need a live API.
- **SI→S2 (hard):** S2 must not invent palette/type/spacing. Empty states, forms, and sidebar consume SI tokens; Dashboard is already the reference and is not redesigned again in S2.
- **S2→S3 (soft):** Finding list stays additive so S3 can attach evidence without rip-and-replace.
- **S3→S4 (soft):** Polish and tooltips sit on a frozen score shape and SI language.

### Why SI sits after S1 and before S2

Surface work (S2) without a frozen language either ships throwaway UI or locks in the accidental dark/emerald prototype. Stack work (S1) first keeps SI demos honest. Putting SI after S2 would force visual rework of every empty state and form S2 just shipped. Putting SI after S3 would leave S2/S3 building on an unowned look.

### Why Project Dashboard is the SI reference surface

It is the hub of the consultant scene (project → score → actions → audit history), dense enough to prove product UI, narrow enough that SI does not absorb Audit Results / executive report / sidebar IA (owned by S2–S4).

## Per-milestone scope

### S0 — Shared foundations (unchanged)

**Owns:** `humanError`, `<EmptyState>` / `<ErrorState>`, `useBackendReachable` — contracts as in the prior umbrella / S0 spec.

**Does not:** re-skin pages, change score, Docker bootstrap.

**Amendment note:** If primitives and reference integrations already exist in `apps/web`, S0's gate is verification + closeout, not a second implementation.

### S1 — "A ferramenta liga" (unchanged ownership)

**Owns:** `bin/dev-up` (or equivalent), Vite proxy 503 when backend down, env/Dockerfile completeness for db push, backoff via `useBackendReachable`, rollout of `humanError` across mutation/query error surfaces.

**Does not:** empty-state CTAs on untouched pages (S2), sidebar restructure (S2), score (S3), design tokens (SI).

### SI — Impeccable foundations (new)

**Pipeline (fixed order):**

1. **`teach`** → write `PRODUCT.md` at the **repository root** (Impeccable default context dir). Register: **product**. Scene: solo consultant, afternoon, large monitor, presenting score to a client in-session. Capture anti-references, tone, and strategic principles. No application code in this step.
2. **Design language** → write `DESIGN.md` from the teach output (not by reverse-engineering current CSS as destiny). Implement matching tokens in `apps/web/src/styles.css` (`:root` and shared primitives). Existing pages may look inconsistent until S2/S4 catch up; that lag is accepted.
3. **`shape` → `craft` Project Dashboard only** — hierarchy: project identity → score → primary actions → audit history; empty/error/loading on that page; client-call legibility; new strings in `en` + `pt-BR`. Shell (sidebar/topbar) may receive **minimal** token application if layout leakage blocks the Dashboard demo; SI does not own sidebar IA (still S2).
4. **Gates:** Impeccable `critique` (and basic `audit` for a11y) on the Dashboard with no severe blockers; amend this program docs if SI decisions change S4 theme assumptions.

**Does not:**
- Redesign Audit Results, executive report, Fixes, Templates, Settings, or other pages
- Restructure sidebar to 7 items or add `/audits` (S2)
- Change `score.ts` or evidence disclosure (S3)
- Persist a global dark/light toggle or add telemetry (S4)
- Replace `humanError` / state primitives (S0)

**Done =** `PRODUCT.md` and `DESIGN.md` committed; tokens live in CSS; Project Dashboard redesigned and demoable in the consultant scene; this amendment (and the July 9 umbrella pointer) reflect SI as part of the sequence.

### S2 — Surfaces (amended consumption)

**Still owns:** Empty/Error on Templates/Settings/Projects lists; URL validation; AuditRunner defaults/ETA; generate disabled-hint; 7-item sidebar + global `/audits`; additive finding-list room for S3.

**Gains:** Must use SI tokens and patterns. Must not redefine the design system or redo Project Dashboard from scratch.

**Does not:** palette/type invention; score math; theme toggle.

### S3 — Score + transparency (amended consumption)

**Still owns:** `score.ts` rewrite, evidence + rationale disclosure, vs-last badge/sparkline, real page counts into ScoreCard, translated category labels/tooltips. Score-engine versioning for historical audits.

**Gains:** Evidence UI and ScoreCard density align with SI / Dashboard patterns.

**Does not:** change global tokens; telemetry; dark mode.

### S4 — Polish + observability (amended)

**Still owns:** empty-state illustration/copy tails; sidebar label clarity; optional localized routes with redirects; footer single-user explanation; CWV browser warning; basic no-PII telemetry.

**Theme (D7) amendment:** If SI/`PRODUCT.md` commits to a **single** theme suited to the afternoon client-call scene, S4 refines that theme rather than treating dark/light as a greenfield invention. If teach explicitly requires dual (day call + night deep work), S4 owns a real second theme on SI tokens, not an afterthought patch.

**Does not:** reopen score math or finding evidence; invent a new design system; redesign Dashboard (already SI).

**Executive report / Audit Results visual debt:** Explicitly allowed to lag until S4 polish or a later follow-up program. SI does not own them.

## Shared contracts

| Contract | Frozen by | Consumers |
|---|---|---|
| `humanError` / EmptyState / ErrorState / `useBackendReachable` | S0 | S1–S4, SI (Dashboard states only) |
| `PRODUCT.md` + `DESIGN.md` + CSS tokens | SI | S2, S3, S4 |
| Sidebar structure | S2 | S4 labels/tooltips only |
| `score.ts` + evidence shape | S3 | S4 copy/tooltips only |

## Cross-cutting rules

1. No milestone edits `score.ts` except S3.
2. No milestone restructures the sidebar except S2 (S4 only labels/tooltips).
3. No milestone redefines global visual language except SI (S4 may add a second theme *on* SI tokens if teach requires it).
4. Every new user-facing string ships in both `en.json` and `pt-BR.json`.
5. Each milestone ends with its acceptance criterion demoable end-to-end.

## Error handling (UI)

- SI does not introduce a new error mapper. Dashboard errors use `humanError` → `<ErrorState>`; backend down uses `useBackendReachable` messaging established in S0/S1.
- Raw technical strings remain banned from user-visible surfaces from S1 onward.

## Testing and verification

| Gate | How |
|---|---|
| S0 | Unit tests on primitives; one real consumer each (or verify existing) |
| S1 | Manual: `dev-up`, create project, run audit &lt;2 min; spot-check error surfaces for human copy |
| SI | Docs present; token variables used by Dashboard; i18n parity for new keys; smoke Dashboard; Impeccable `critique` without severe blockers |
| S2 | Manual E2E: create→audit→generate→publish, no docs, no dead-ends |
| S3 | Before/after score on a real audit; every displayed point opens evidence |
| S4 | Client-call / first-open “product not prototype” review; telemetry no-PII check |

## Risk register

1. **Teach overturns dark/emerald.** Pages outside Dashboard look broken until S2/S4. *Mitigation:* documented lag; S2 prioritizes high-traffic paths on new tokens. *Owner: SI / S2.*
2. **SI scope creep into Audit Results / executive report.** *Mitigation:* hard out-of-scope list above; visual debt deferred to S4 or follow-up. *Owner: SI.*
3. **Dual theme discovered late.** *Mitigation:* teach must decide single vs dual before tokens freeze; S4 owns second theme only if PRODUCT.md requires it. *Owner: SI teach / S4.*
4. **S1 incomplete blocks SI demos.** *Mitigation:* SI does not start until S1 acceptance is met. *Owner: S1.*
5. Prior umbrella risks (Docker `dev-up`, score rewrite history, proxy change, localized routes) remain as stated in `2026-07-09-ux-program-design.md`.

## Open questions deferred to milestone specs

- **SI teach:** exact anti-references, tone adjectives, and single vs dual theme (answered during `teach`, then frozen in `PRODUCT.md`).
- **SI craft:** Dashboard information architecture details (wireframes in SI's own shape pass).
- **S1:** shell vs Node for `dev-up` (unchanged from prior umbrella).
- **S2:** exact sidebar seven items and `/audits` shape.
- **S3:** category weights, curve exponent, score-engine version storage.

## Relationship to prior docs

| Doc | Role after this amendment |
|---|---|
| `2026-07-09-ux-program-design.md` | Historical S0–S4 ownership detail; sequence **overridden** by this file (`SI` inserted). Status should read amended. |
| `2026-07-09-s0-shared-foundations-design.md` | Still governs S0 if not already closed. |
| `docs/ux-audit-2026-07-09.md` | Problem inventory; SI does not map 1:1 to an audit letter (it enables S2/S4 quality). |
| This file | Authoritative for program sequence and SI boundaries. |

## Next step

User reviews this spec → on approval, invoke **writing-plans** for the next executable milestone in sequence (verify/close S0 if open, else S1, else SI). Per-milestone brainstorm/spec/plan cycles continue; SI's plan must start with `teach` before any Dashboard craft.
