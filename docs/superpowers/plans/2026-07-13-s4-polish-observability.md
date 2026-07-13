# S4 — Polish + Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First-open / client-call reads as a product: localized routes with EN redirects, clearer shell copy, CWV warning, richer empties, client-only session telemetry, light Results/report polish.

**Architecture:** Shell-first. Introduce `localePath` + redirect routes driven by active i18n language; harden Layout footer/nav tooltips; AuditRunner static CWV note; telemetry ring buffer + Settings panel; then token/hierarchy polish on Audit Results + Executive Report View. No API telemetry. No score.ts edits.

**Tech Stack:** React Router, i18next, Vitest, SI CSS tokens. localStorage only for telemetry/theme.

**Spec:** `docs/superpowers/specs/2026-07-13-s4-polish-observability-design.md`

**Out of scope:** score engine, sidebar structure, server analytics, CWV probe/install, executive report content redesign.

---

## File Structure

**Create:**
- `apps/web/src/i18n/localePath.ts` + `localePath.test.ts` — route id → localized pathname; reverse map for redirects
- `apps/web/src/telemetry/sessionTelemetry.ts` + test — ring buffer (cap 200), typed events, clear
- `apps/web/src/components/SessionTelemetryPanel.tsx` (+ optional test) — Settings section
- `apps/web/src/components/LocaleRedirects.tsx` or route factory — EN↔pt-BR redirects

**Modify:**
- `apps/web/src/routes.tsx` — localized path trees + redirects
- `apps/web/src/components/Layout.tsx` — `localePath` for nav `to`; tooltips; footer D6 copy; track `nav_click`
- `apps/web/src/components/LanguageToggle.tsx` — remap URL on locale change
- `apps/web/src/pages/AuditRunner.tsx` — CWV note
- `apps/web/src/components/fixes/EmptyFixesState.tsx` — B11 copy/art → prefer shared `EmptyState` if easy
- `apps/web/src/pages/Settings.tsx` — mount SessionTelemetryPanel
- `apps/web/src/pages/AuditResults.tsx`, `ExecutiveReportView.tsx` — light SI polish + Empty/Error gaps
- `apps/web/src/main.tsx` or App shell — `page_view` on location change
- `apps/web/src/api/readJsonOrThrow.ts` or fetch wrapper — `api_error` events (status + family only)
- `apps/web/src/i18n/en.json` + `pt-BR.json`
- Grep-fix hardcoded `/projects`, `/audits`, … in `apps/web/src` to `localePath` where navigational

---

### Task 1: `localePath` helper (D5 foundation)

**Files:** `apps/web/src/i18n/localePath.ts`, test

- [ ] **Step 1: Tests** for en/pt-BR segment map from spec; `localePath('projects')`; nested `localePath('projectAudit', { projectId })` (define ids needed by current routes).
- [ ] **Step 2: Implement** map + `pathForLocale(locale, id, params?)` + `englishPath(id, params?)` for redirect sources.
- [ ] **Step 3: Commit** `feat(web): localePath helper for localized routes`

---

### Task 2: Routes + redirects + language URL sync

**Files:** `routes.tsx`, `LanguageToggle.tsx`, Layout nav links

- [ ] **Step 1:** Build route tree using `localePath` for the **active** locale (read from i18n at render, or duplicate Route sets for both locales pointing at same elements — prefer one tree keyed by current locale plus redirect routes for the other).
- [ ] **Step 2:** For every localized first segment, add `<Route path={en} element={<Navigate replace to={pt} />} />` when locale is pt-BR (and reverse when en), preserving `*` rest / params via relative redirect helper.
- [ ] **Step 3:** LanguageToggle: on change, `navigate` to sibling localized path of `location.pathname`.
- [ ] **Step 4:** Update Layout `NAV[].to` via `localePath`.
- [ ] **Step 5:** Tests: navigate helper or router test that `/projects` redirects under pt-BR; parity of nav targets.
- [ ] **Step 6: Commit** `feat(web): localized routes with EN/pt-BR redirects`

---

### Task 3: Shell copy — sidebar tooltips + footer (D3/D4/D6)

**Files:** `Layout.tsx`, i18n

- [ ] **Step 1:** Clearer `sidebar.workspace` / section label keys.
- [ ] **Step 2:** Per-nav tooltip keys (`nav.projectsHint`, …).
- [ ] **Step 3:** Expand `sidebar.userMeta` (or adjacent) into D6 single-user explanation.
- [ ] **Step 4:** Soften/remove unexplained header acronym strip if present; tooltips if kept.
- [ ] **Step 5: Commit** `fix(web): clarify sidebar labels, tooltips, and single-user footer`

---

### Task 4: CWV warning on AuditRunner (C4)

**Files:** `AuditRunner.tsx`, i18n, AuditRunner test

- [ ] **Step 1:** Static note with `role="note"` + i18n keys `audit.runner.cwvBrowserWarning`.
- [ ] **Step 2:** Test asserts warning text/role present.
- [ ] **Step 3: Commit** `feat(web): static CWV Chromium warning on AuditRunner`

---

### Task 5: Fixes empty state (B11) + B10 gap-check

**Files:** `EmptyFixesState.tsx`, FindingList label if needed, i18n

- [ ] **Step 1:** Stronger empty copy + optional empty art (reuse SVG pattern from FindingList empty).
- [ ] **Step 2:** Confirm FindingList CTA; rename key to clearer “Suggest fix” / “Sugerir correção” if current string is weak.
- [ ] **Step 3: Commit** `fix(web): Fixes empty state and suggest-fix CTA copy`

---

### Task 6: Session telemetry ring buffer + Settings panel

**Files:** `sessionTelemetry.ts`, test, `SessionTelemetryPanel.tsx`, `Settings.tsx`, instrumentation hooks

- [ ] **Step 1: Tests** — push beyond cap drops oldest; clear empties; reject/ignore events containing `http://` in payload fields (guard).
- [ ] **Step 2: Implement typed events: `{ v:1, t, type, at, meta }` where meta is allowlisted.
- [ ] **Step 3:** Instrument `page_view` (route id), `nav_click`, `api_error` (status + coarse path family).
- [ ] **Step 4:** Settings panel: summary counts, last N events, Clear.
- [ ] **Step 5: Commit** `feat(web): client-only session telemetry panel in Settings`

---

### Task 7: Light polish Audit Results + Executive Report

**Files:** `AuditResults.tsx`, `ExecutiveReportView.tsx`, CSS only if needed

- [ ] **Step 1:** Token/spacing/hierarchy pass; remove any non-SI accent leftovers.
- [ ] **Step 2:** Empty/Error gaps with `humanError` where missing.
- [ ] **Step 3:** No narrative/chart semantic changes — screenshot-level polish only.
- [ ] **Step 4: Commit** `fix(web): light SI polish on Audit Results and executive report`

---

### Task 8: D7 gap-check + acceptance gate

- [ ] **Step 1:** Confirm theme boot from `localStorage` (add test if missing).
- [ ] **Step 2:**

```bash
pnpm --filter @jheo/web test
pnpm --filter @jheo/web typecheck
# i18n parity included in web tests
```

- [ ] **Step 3: Manual**
  1. First-open cold UI in light theme — product not prototype.
  2. Switch to pt-BR — URL becomes `/projetos` (etc.); EN URL redirects.
  3. AuditRunner shows CWV note; Start still works.
  4. Click around → Settings “Sua sessão” shows events; inspect buffer — no PII/URLs.
  5. Spot Audit Results + one executive report for visual consistency.

- [ ] **Step 4:** Mark S4 complete only if manual perception + no-PII pass.

---

## Spec coverage

| Spec item | Task(s) |
|-----------|---------|
| D5 localePath + redirects | 1, 2 |
| D3/D4/D6 shell copy | 3 |
| C4 CWV | 4 |
| B11 / B10 | 5 |
| Telemetry | 6 |
| Results + report polish | 7 |
| D7 + acceptance | 8 |

## Implementation notes

- Prefer **replace** redirects to avoid history stacks of EN→pt bounce.
- When grepping hardcoded paths, leave external `https://` and API `/api/...` alone.
- Telemetry meta allowlist: `routeId`, `navId`, `status`, `apiFamily` (`audits`|`projects`|…).
- If dual Route trees fight React Router, use: always declare both localized full trees (same elements) + no redirect needed for active links; still add cross-locale redirects for the inactive language’s segments.
