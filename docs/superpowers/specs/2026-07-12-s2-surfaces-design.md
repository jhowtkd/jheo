# S2 — "Consigo usar sem perguntar" (Design)

- **Date:** 2026-07-12
- **Status:** Draft — awaiting user review
- **Kind:** Milestone spec under the UX program
- **Umbrella:** `docs/superpowers/specs/2026-07-09-ux-program-design.md`
- **Amendment:** `docs/superpowers/specs/2026-07-11-ux-impeccable-hybrid-design.md` (SI tokens; S2 consumes them)
- **Audit items:** B1, B2, B3, B6, B7, B8, B9, D1
- **Baseline:** SI complete (Score Ledger tokens, dual theme, Project Dashboard craft)

## TL;DR

S2 removes dead-ends so a new user can walk **create project → audit → generate → publish** using only the UI. It restructures the sidebar to eight items (seven workspace + Settings), adds a global `/audits` list, applies shared Empty/Error states, hardens project URL input, upgrades AuditRunner with config + ETA, and surfaces a generate disabled-hint when no template is active. Executive **Reports** leave the sidebar and remain reachable only from Audit Results. Project-scoped surfaces (Materials, Generations, Channels, Fixes) use a Fixes-style project chooser.

## Decisions (brainstorming)

1. **Monolithic S2** — one milestone covering nav + empties + runner + generate hint + publish-path clarity (not S2a/S2b split).
2. **Sidebar = audit’s seven + Settings as 8th:** Projects · Audits · Templates · Materials · Generations · Fixes · Channels · Settings.
3. **Reports removed from nav** — only via Audit Results tabs/export.
4. **Project chooser pattern (A)** for Materials / Generations / Channels (and existing Fixes): `?projectId=` or last-used; else picker.
5. **Acceptance (A):** new user reaches a successful **publish** without reading docs.

## What this milestone is and isn't

**Is:** IA/nav, empty/error honesty on list surfaces, AuditRunner usability, generate gating hint, global audits index, client URL validation, additive finding-list constraint for S3, route/CTA clarity through publish.

**Isn't:** score math or evidence disclosure (S3); theme/token redesign (SI done); Dashboard re-craft (SI); executive report visual redesign (S4 / later); telemetry (S4).

## Navigation contract

| Order | Label key (i18n) | Route | Notes |
|------:|------------------|-------|-------|
| 1 | `nav.projects` | `/projects` | unchanged |
| 2 | `nav.audits` | `/audits` | **new** global list |
| 3 | `nav.templates` | `/templates` | unchanged |
| 4 | `nav.materials` | `/materials` | global entry → chooser or `?projectId=` → project materials |
| 5 | `nav.generations` | `/generations` | global entry → chooser → project compose/list |
| 6 | `nav.fixes` | `/fixes` | already chooser-capable |
| 7 | `nav.channels` | `/channels` | global entry → chooser → project channels |
| 8 | `nav.settings` | `/settings` | 8th item after Channels |

- Remove `nav.reports` / `/reports` from sidebar. Keep `/reports` route as a **soft redirect** or interstitial (“open an audit to view executive reports”) — never a silent 404.
- Deep links `/projects/:id/materials|compose|channels` remain valid.
- Persist last project id in `localStorage` (e.g. `jheo.lastProjectId`) when the user opens a project dashboard or selects from a chooser.

## `/audits` page

- Lists recent audit runs across projects: project name, status, overall score (or —), started/finished timestamps.
- Row navigates to `/audits/:auditId`.
- Empty: EmptyState CTA → `/projects`.
- Error: ErrorState + humanError + retry.
- Data: prefer a dedicated list endpoint if one exists or is cheap to add; otherwise aggregate from projects’ audit arrays with a documented limit (e.g. last 50). Exact API choice belongs in the implementation plan but must not invent pagination UI beyond a simple “recent” list.

## Empty / Error rollout (B1–B3 + new lists)

Apply `<EmptyState>` / `<ErrorState>` + `humanError` on:

- Projects (already partially done — ensure list load errors too)
- Templates, Settings
- Materials, Generations, Channels (chooser + list)
- Audits (new)

Every empty state includes a CTA to the next step in the happy path (create project, create template, run audit, configure channel, etc.).

## URL validation (B6)

- On project create: client-side check that input is a plausible http(s) URL or bare domain (normalize to URL before submit, matching API `domain`/`rootUrl` refine).
- Align label, placeholder, and helper text with backend acceptance; show inline validation error before mutate when invalid.
- Do not change Prisma schema; only client + copy + existing API contract.

## AuditRunner (B7) + progress ETA (B9)

**Before start:**

- `maxPages` default **50** (editable)
- Source toggles: sitemap / crawl / root (defaults: all on, or match current backend defaults — document in plan)
- Rough ETA copy: e.g. `maxPages × 8s` (+ short overhead note)
- Optional URL preview: best-effort; if preview fails or is slow, show soft warning and still allow start (must not block)

**While running (B9):** where progress UI already exists (Dashboard / results), show ETA from rolling average pages/sec when enough samples exist; otherwise hide ETA rather than lying.

Pass config into `runAudit` / API body as the backend already accepts `config` — extend types if fields are missing; do not invent score behavior.

## Generate disabled-hint (B8)

On GenerationComposer: if no active template (and none selected), primary submit stays disabled and a visible hint explains that an active template is required, with a link to `/templates`.

## Finding list constraint

Any FindingList changes in S2 are **additive only** (layout/spacing/empty). No evidence accordion yet — S3 owns disclosure.

## Publish path clarity

- Channels empty → CTA to create channel for current project.
- Publish actions remain on generation review / publish detail; ensure buttons are labeled and disabled states explain missing channel/approval.
- Gate A requires a real `publish` success in manual acceptance when a channel can be configured (HTTP channel is acceptable if WordPress creds are absent). Document the recommended channel type in the plan’s test steps.

## Cross-cutting

1. Consume SI tokens / existing components; no new palette.
2. Every new string in `en.json` + `pt-BR.json`.
3. No edits to `score.ts`.
4. Theme toggle stays as SI left it (not S2 scope).

## Testing and acceptance

| Gate | How |
|------|-----|
| Unit/component | URL validator; AuditRunner defaults; generate hint visibility; Layout has 8 nav targets including `/audits`; parity i18n |
| Manual | Cold UI path: create project → configure audit → complete audit → ensure template → compose → approve → configure channel → publish completed |

**Done =** a new user, without README, reaches publish completed via the UI alone.

## Risk register

1. **Global Materials/Generations/Channels without chooser** → dead-end. *Mitigation:* Fixes-style chooser mandatory before list. *Owner: S2.*
2. **Audit preview expensive/flaky.** *Mitigation:* best-effort; never block Start. *Owner: S2.*
3. **Publish gate blocked by missing BYOK/secrets.** *Mitigation:* manual script uses HTTP channel or documents required Settings keys; empty states must teach configuration. *Owner: S2 acceptance.*
4. **`/reports` bookmarks break.** *Mitigation:* soft redirect/interstitial. *Owner: S2.*

## Open questions deferred to implementation plan

- Exact list API for `/audits` (new route vs client aggregate).
- Precise `config` shape fields for sources/maxPages already supported by API.
- Whether Generations global landing is compose-first or list-first after chooser.

## Next step

User reviews this spec → writing-plans → implement. Then S3.
