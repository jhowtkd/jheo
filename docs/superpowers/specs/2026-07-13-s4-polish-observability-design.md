# S4 — "Parece ferramenta" (Design)

- **Date:** 2026-07-13
- **Status:** Draft — awaiting user review
- **Kind:** Milestone spec under the UX program
- **Umbrella:** `docs/superpowers/specs/2026-07-09-ux-program-design.md`
- **Amendment:** `docs/superpowers/specs/2026-07-11-ux-impeccable-hybrid-design.md`
- **Audit items:** B10 (gap-check), B11, C4, D3, D4, D5, D6, D7 (gap-check), telemetry
- **Baseline:** S3 complete (defensible scores); SI dual theme + Score Ledger tokens; S2 eight-item nav

## TL;DR

S4 closes the UX program perception gap: first open and client-call should read as a **product**, not a prototype. It ships localized route aliases with EN redirects, clearer sidebar/footer copy, fixed CWV Chromium warning on AuditRunner, richer empty-state tails, client-only session telemetry in Settings, and a light SI-token polish pass on Audit Results + executive report — without redesigning score math, IA, or the design system.

## Decisions (brainstorming)

1. **Monolithic S4** — polish + C4 + telemetry + D5 routes + light Results/report polish in one delivery.
2. **Approach:** shell-first (routes/copy/C4/empties → telemetry panel → Results/report polish).
3. **D5:** locale paths (e.g. `/projetos`) with **redirects from current EN paths** (bookmarks keep working).
4. **Telemetry (A):** client-only ring buffer in `localStorage` + Settings panel “sua sessão”; no server POST; no PII.
5. **C4 (A):** fixed copy on AuditRunner (no browser probe).
6. **Results + executive report (A):** light polish (SI tokens, hierarchy, Empty/Error) — **no content redesign**.
7. **D7:** already delivered in SI (`ThemeToggle` + `localStorage`) — S4 only gap-checks.
8. **B10:** FindingList already links to `/fixes?auditId&findingId` — S4 only polish label/copy if needed.

## What this milestone is and isn't

**Is:** localized routes + redirects; sidebar section/footer clarity; CWV warning copy; empty-state illustration/copy tails (esp. Fixes); session telemetry UI; light visual polish on Audit Results + Executive Report View; B10/D7 verification.

**Isn't:** score engine changes; sidebar restructure; new design system / palette; server-side analytics; Chromium auto-install; deep executive-report content rewrite; Dashboard re-craft (SI).

## Localized routes (D5)

- Canonical path language follows **active UI locale** (`en` → English segments; `pt-BR` → Portuguese segments).
- Keep a single source of route **ids** (e.g. `projects`, `audits`) mapped to localized path prefixes.
- **Always** register EN paths as redirects (301/replace) to the locale-canonical path when locale is `pt-BR`, and vice versa when needed so old links work.
- Minimum segment map (extend as routes already exist):

| id | en | pt-BR |
|----|----|-------|
| projects | `/projects` | `/projetos` |
| audits | `/audits` | `/auditorias` |
| templates | `/templates` | `/modelos` |
| materials | `/materials` | `/materiais` |
| generations | `/generations` | `/geracoes` |
| fixes | `/fixes` | `/correcoes` |
| channels | `/channels` | `/canais` |
| settings | `/settings` | `/configuracoes` |
| reports | `/reports` | `/relatorios` |

- Nested ids (`/projects/:id/audit`, compose, channels, etc.) follow the same first-segment localization; param segments stay as ids.
- `Link`/`NavLink`/`navigate` must go through a small `localePath(id, params)` helper — no hardcoded `/projects` in new code; migrate call sites touched by S4.
- Language toggle: switching locale updates the current URL to the sibling localized path (preserve params/query).

## Shell copy (D3, D4, D6)

- Sidebar section label: replace opaque “workspace” jargon with clear i18n (e.g. “Menu” / “Navegação”) if current copy fails first-open clarity.
- Nav items: keep S2 structure; add **tooltips** (title or HelpTip) explaining what each destination does (not score categories — those are ScoreCard).
- Footer meta: expand “single-user / uso único” into an explicit one-liner (D6): this instance is local-only, no login, no cloud sync — plus version.
- Header “GEO · SEO · …” (if still present as unexplained chrome): either remove or tooltip each term — do not leave unexplained acronyms in chrome.

## CWV warning (C4)

On AuditRunner, always show a short `role="note"` (or similar) warning:

- EN/pt copy: CWV needs a browser (Chromium); prefer Docker / `bin/dev-up`; standalone API may skip or fail CWV.
- No capability probe in S4.
- Does not block Start.

## Empty states (B11 + tails)

- Fixes empty (`EmptyFixesState` / EmptyState): illustration or stronger empty art + copy that suggestions appear after audits; CTA to projects/audits as appropriate.
- Spot-check other high-traffic empties for one-line “what happens next” tails if still skeletal — YAGNI on low-traffic pages.

## Telemetry (client-only)

**Events (examples):** `page_view` (route id only, not raw URL with secrets), `nav_click` (nav id), `api_error` (status + route family, never body/headers/tokens).

**Storage:** ring buffer in `localStorage` (cap e.g. 200 events); schema versioned; purge oldest.

**PII rules:** no project names, URLs, prompts, finding text, API keys, emails. Route **ids** and HTTP status only.

**UI:** Settings section “Your session” / “Sua sessão”: counts by event type, recent list, Clear button. No export-to-server.

## Light polish — Audit Results + Executive Report

- Apply SI spacing/type/color tokens consistently; fix any leftover emerald/prototype chrome.
- Ensure EmptyState/ErrorState + `humanError` where load can fail.
- Do **not** change report narrative structure, chart semantics, or score disclosure rules from S3.

## Gap-checks

| Item | Action |
|------|--------|
| D7 theme persist | Verify ThemeToggle + boot apply from `localStorage`; fix only if broken |
| B10 suggest fix | Verify FindingList CTA; polish i18n label toward “Suggest fix” clarity |

## Out of scope

| Item | Owner |
|------|--------|
| `score.ts` / evidence shape | frozen S3 |
| Sidebar item set / order | frozen S2 |
| Server telemetry / Postgres aggregates | never in S4 |
| CWV auto-detect / install | never in S4 |
| Full executive report content redesign | later program |
| New PRODUCT.md teach | SI done |

## Cross-cutting rules

1. Every new string in `en.json` + `pt-BR.json`.
2. Consume SI tokens only; no new palette.
3. No score math edits.
4. Telemetry must pass a manual no-PII checklist (sample buffer after a cold path).

## Testing and acceptance

| Gate | How |
|------|-----|
| Unit | `localePath` map + redirects; telemetry ring buffer cap + clear; CWV note present on AuditRunner |
| i18n | parity test green |
| Manual | First-open review: “product not prototype”; switch language → URL localizes; Settings session panel shows events without PII; AuditRunner shows CWV note |

**Done =** first-time / client-call reviewer reads product; telemetry buffer contains no PII.

## Risk register

1. **D5 misses a hardcoded path** → 404 after locale switch. *Mitigation:* helper + grep for `/projects` etc.; redirects for EN. *Owner: S4.*
2. **Telemetry accidentally logs URLs.** *Mitigation:* typed event schema; tests forbid `http` in payloads. *Owner: S4.*
3. **Report polish scope creep.** *Mitigation:* tokens/hierarchy/empty only; no content rewrite. *Owner: S4.*
4. **pt-BR slug bikeshedding.** *Mitigation:* table above is normative; change only with spec amend. *Owner: S4.*

## Open questions deferred to implementation plan

- Exact React Router pattern (dual Route list vs middleware-style redirect component).
- Whether `publishes` / `page-audits` deep links need localized first segments in v1.
- Empty art: reuse existing SVG empty art vs one new illustration asset.

## Next step

User reviews this spec → writing-plans → implement. UX program S0→S4 closes after S4 acceptance.
