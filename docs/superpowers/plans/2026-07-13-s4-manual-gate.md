# S4 — Manual acceptance gate (browser)

Run these checks with `pnpm --filter @jheo/web dev` (and `pnpm --filter @jheo/api dev` if you need live data; otherwise mock-data-only paths work).

## 1. Cold-open first impression (D6 + polish)

- [ ] Open in **incognito** (clean localStorage) at `http://localhost:5173`.
- [ ] Light theme is active (no flash of wrong theme).
- [ ] Sidebar shows `Menu` (en) / `Menu` (pt-BR) — **not** "Workspace".
- [ ] Footer reads `Local-only · no login · no cloud sync · v0.1.0` (en) or `Local · sem login · sem sync na nuvem · v0.1.0` (pt-BR).
- [ ] Hover over each nav item — a tooltip explains it (e.g. "Audit, generate, and distribute content per site").
- [ ] Hover over the GEO · SEO · content wordmark — tooltip spells out each acronym.

## 2. Localized routing (D5)

- [ ] URL `/` redirects to `/projects` (en) or `/projetos` (pt-BR) per active locale.
- [ ] Visit `/projects/abc-123` while UI is en → renders ProjectDashboard for `abc-123`.
- [ ] Switch UI to pt-BR via the language toggle → URL becomes `/projetos/abc-123` (replace, not push).
- [ ] Switch back to en → URL flips to `/projects/abc-123`.
- [ ] Click the **breadcrumb root** (e.g. "Projetos") while on a pt-BR URL → goes to `/projetos` (not `/projects`).
- [ ] Click a project link on the dashboard → goes to `/projetos/<id>` (en route: `/projects/<id>`).
- [ ] Open `Materials` nav → if no project picked, gate renders → after pick, lands on `/projetos/<id>/materials`.

## 3. CWV warning (C4)

- [ ] Open `/projects/<id>/audit` (AuditRunner) — a small note card at the top mentions Chromium / `bin/dev-up`.
- [ ] The note has `role="note"` (verify in devtools Elements pane).
- [ ] Click **Start audit** — still works, no blocking.

## 4. Session telemetry (no PII)

- [ ] Navigate around: Projects → ProjectDashboard → Settings → AuditsList → back to Projects.
- [ ] Open `/settings` — the new "Sua sessão" (pt-BR) / "Your session" (en) section shows:
  - Counts: page views > 0, nav clicks > 0
  - Last N events listed with route id, status, timestamp
- [ ] Click **Clear** — buffer empties, counts reset to 0.
- [ ] In devtools → Application → Local Storage, find `jheo.sessionTelemetry.v1`.
  - Verify no `http://` or `https://` strings inside any `meta` field (PII guard).
  - Verify no project names, URLs, prompts, or finding text — only `routeId`/`navId`/`status`/`apiFamily`.
- [ ] Trigger an API error (e.g. stop the API server, then reload) — `api_error` events appear in the buffer with status codes + family (`audits` / `projects` / …).

## 5. Audit Results + Executive Report polish

- [ ] Open a completed audit's report — ScoreCard + Findings list read as one piece (SI tokens, consistent spacing).
- [ ] Switch tabs to **Executive** — executive report renders without overlap or chrome leftovers.
- [ ] If the report endpoint is unreachable, you should see a translated ErrorState (not a blank page or raw error).

## 6. Fixes empty + CTA (B11 + B10)

- [ ] On `/fixes` with no project → "Ir para projetos" CTA uses `localePath('projects')` (verify in devtools the rendered `href`).
- [ ] On a project with no fixes → "Suggestions appear here as soon as an audit finishes." hint + art visible.
- [ ] On a finding row → "Sugerir correção" (pt-BR) / "Suggest fix" (en) button is the CTA.

## Pass / fail

All items green → S4 closed. Any red item → file as follow-up; do not push until addressed (or document the deferral in the PR description).

## Quick PII grep

If you want to be paranoid, paste this in devtools console on the Settings page after exercising the app:

```js
JSON.parse(localStorage.getItem('jheo.sessionTelemetry.v1') || '[]')
  .flatMap(e => Object.values(e.meta))
  .filter(v => typeof v === 'string' && /https?:|\.com|\.br|@/.test(v));
// → must return [] (empty array)
```