# SI — Impeccable Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land PRODUCT/DESIGN context as code: dual-theme Score Ledger tokens (default light), theme persistence + toggle, and a Project Dashboard craft pass that is demoable on a client call.

**Architecture:** Semantic CSS variables on `:root` (light) and `[data-theme="dark"]` (dark). A tiny `theme.ts` module mirrors the locale pattern (`jheo.theme` in localStorage). Shell gets a `ThemeToggle`. Project Dashboard is restructured for call hierarchy (identity → score → actions → audit/pages) and uses `humanError`/`ErrorState` instead of raw alerts. Other pages may look transitional until S2 — accepted by the hybrid program.

**Tech Stack:** React, CSS custom properties, Vitest, react-i18next, existing Layout/ScoreCard/EmptyState/ErrorState.

**Specs / context:**
- Program: `docs/superpowers/specs/2026-07-11-ux-impeccable-hybrid-design.md` (SI section)
- `PRODUCT.md`, `DESIGN.md` (seed — The Score Ledger) at repo root
- Out of scope: Audit Results / executive report redesign, sidebar IA (S2), score math (S3), telemetry (S4)

**Prerequisite:** S1 complete. Do not rebuild S0 primitives.

---

## File Structure

**Create:**
- `apps/web/src/theme/theme.ts` — resolve/apply/persist theme (`light` | `dark`)
- `apps/web/src/theme/theme.test.ts`
- `apps/web/src/components/ThemeToggle.tsx`
- `apps/web/src/components/ThemeToggle.test.tsx`
- `apps/web/src/pages/__tests__/ProjectDashboard.test.tsx` (error + hierarchy smoke)
- `apps/web/src/styles/tokens.css` *(optional split)* — only if keeping `styles.css` under control; default is rewrite `:root` in place in `styles.css`

**Modify:**
- `apps/web/src/styles.css` — replace emerald/dark-only tokens with light defaults + dark overrides; remove accent-glow theater; keep spacing/radius scales
- `apps/web/index.html` — `color-scheme: light dark`; FOUC-prevention script; favicon without emerald glow
- `apps/web/src/main.tsx` — call `applyStoredTheme()` before/with render (FOUC script in HTML is primary)
- `apps/web/src/components/Layout.tsx` — mount `ThemeToggle` next to `LanguageToggle`
- `apps/web/src/pages/ProjectDashboard.tsx` — hierarchy + ErrorState + remove `window.alert`
- `apps/web/src/components/ScoreCard.tsx` — tabular overall score, call-legible hierarchy (minimal)
- `apps/web/src/i18n/en.json` + `pt-BR.json` — `topbar.theme`, `topbar.themeLight`, `topbar.themeDark`
- `DESIGN.md` — after tokens land, replace seed placeholders with concrete hex (short update, same commit as tokens or follow-up Task)

**Do not:** restructure sidebar nav items; edit `score.ts`; redesign Fixes/AuditResults; add telemetry.

---

### Task 0: Commit teach artifacts (if not already on branch)

**Files:** `PRODUCT.md`, `DESIGN.md`

- [ ] **Step 1: Stage and commit**

```bash
git add PRODUCT.md DESIGN.md
git commit -m "$(cat <<'EOF'
docs: add PRODUCT.md and DESIGN.md Score Ledger seed

Impeccable teach + seed design language for SI (dual theme, default light).
EOF
)"
```

Skip if already committed.

---

### Task 1: Theme module (resolve / apply / persist)

Mirror `apps/web/src/i18n/locale.ts` patterns.

**Files:**
- Create: `apps/web/src/theme/theme.ts`
- Create: `apps/web/src/theme/theme.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// apps/web/src/theme/theme.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { THEME_STORAGE_KEY, resolveTheme, applyTheme, type Theme } from './theme.js';

describe('theme', () => {
  beforeEach(() => {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to light when nothing stored', () => {
    expect(resolveTheme()).toBe('light');
  });

  it('reads valid localStorage value', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(resolveTheme()).toBe('dark');
  });

  it('ignores invalid localStorage and returns light', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    expect(resolveTheme()).toBe('light');
  });

  it('applyTheme sets data-theme and persists', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm --filter @jheo/web test src/theme/theme.test.ts
```

- [ ] **Step 3: Implement**

```ts
// apps/web/src/theme/theme.ts
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'jheo.theme';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

/** Default is light (afternoon / projector). Stored preference wins. */
export function resolveTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isTheme(stored) ? stored : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function applyStoredTheme(): Theme {
  const theme = resolveTheme();
  applyTheme(theme);
  return theme;
}
```

Note: SI chose dual theme with **default light**, not `prefers-color-scheme` auto. Do not follow OS preference unless the user explicitly toggles.

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm --filter @jheo/web test src/theme/theme.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/theme/theme.ts apps/web/src/theme/theme.test.ts
git commit -m "feat(web): add theme resolve/apply with light default"
```

---

### Task 2: Score Ledger tokens (light + dark) in CSS

Replace emerald/glow dark-only `:root` with light defaults and dark overrides. Keep existing `--space-*`, `--radius-*`, `--fs-*`, `--sidebar-w`, `--topbar-h` names so components keep working.

**Files:**
- Modify: `apps/web/src/styles.css` (token block at top + `body` background; remove/neutralize `--accent-glow` usages)
- Modify: `apps/web/index.html` (`color-scheme`, FOUC script, favicon)

**Normative token values (frontmatter contract):**

Light (`:root` / `data-theme="light"`):

| Token | Hex |
|-------|-----|
| `--bg` | `#f4f6f9` |
| `--surface` | `#ffffff` |
| `--surface-2` | `#eef1f6` |
| `--surface-3` | `#e2e8f0` |
| `--bg-elevated` | `#eef1f6` |
| `--border` | `#d8dee8` |
| `--border-strong` | `#b8c0d0` |
| `--text` | `#0f172a` |
| `--text-dim` | `#475569` |
| `--text-muted` | `#64748b` |
| `--accent` | `#2563eb` |
| `--accent-dim` | `#1d4ed8` |
| `--accent-bright` | `#3b82f6` |
| `--accent-glow` | `rgba(37, 99, 235, 0.12)` *(selection only — no box-shadow glow)* |
| `--success` | `#15803d` |
| `--warning` | `#b45309` |
| `--danger` | `#b91c1c` |
| `--info` | `#1d4ed8` |

Dark (`[data-theme="dark"]`):

| Token | Hex |
|-------|-----|
| `--bg` | `#0b1220` |
| `--surface` | `#121a2b` |
| `--surface-2` | `#1a2438` |
| `--surface-3` | `#243049` |
| `--bg-elevated` | `#1a2438` |
| `--border` | `#2a364d` |
| `--border-strong` | `#3d4d6b` |
| `--text` | `#e8eef8` |
| `--text-dim` | `#9aa8c0` |
| `--text-muted` | `#6b7a94` |
| `--accent` | `#3b82f6` |
| `--accent-dim` | `#2563eb` |
| `--accent-bright` | `#60a5fa` |
| `--accent-glow` | `rgba(59, 130, 246, 0.18)` |
| `--success` | `#22c55e` |
| `--warning` | `#fbbf24` |
| `--danger` | `#f87171` |
| `--info` | `#60a5fa` |

`--bg-grad`: **none / `none`** in both themes (no emerald/blue radial theater).

`--shadow-accent`: replace with quiet border ring, e.g. `0 0 0 1px var(--border-strong)` — no colored glow.

- [ ] **Step 1: Rewrite the `:root { ... }` block** in `styles.css` with light values above. Add immediately after:

```css
[data-theme="dark"] {
  /* dark token overrides only — do not repeat spacing/type scales */
  --bg: #0b1220;
  /* ...all dark rows from the table... */
  --bg-grad: none;
}
```

Set `body { background-image: none; }` (or `var(--bg-grad)` which is `none`).

- [ ] **Step 2: Grep and neutralize glow theater**

```bash
rg -n "accent-glow|shadow-accent|10b981|34d399" apps/web/src/styles.css
```

Any `box-shadow: … var(--accent-glow)` decorative uses → remove or replace with `var(--shadow-sm)` / border. Keep `::selection` using a subtle `--accent-glow` fill if contrast remains OK.

- [ ] **Step 3: Update `index.html`**

```html
<meta name="color-scheme" content="light dark">
```

Add **before** any CSS (inline, synchronous) to prevent FOUC:

```html
<script>
  (function () {
    try {
      var t = localStorage.getItem('jheo.theme');
      if (t !== 'light' && t !== 'dark') t = 'light';
      document.documentElement.setAttribute('data-theme', t);
      document.documentElement.style.colorScheme = t;
    } catch (e) {}
  })();
</script>
```

Update favicon SVG fills to slate/ink + ledger blue (`#2563eb`), not emerald.

- [ ] **Step 4: Call `applyStoredTheme()` from `main.tsx`** before render (belt-and-suspenders with the HTML script):

```ts
import { applyStoredTheme } from './theme/theme.js';
applyStoredTheme();
```

- [ ] **Step 5: Visual smoke (manual)**

```bash
pnpm --filter @jheo/web dev
# open /, confirm light canvas; set localStorage jheo.theme=dark; reload; confirm dark
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/styles.css apps/web/index.html apps/web/src/main.tsx
git commit -m "feat(web): Score Ledger light/dark CSS tokens (default light)"
```

---

### Task 3: ThemeToggle + i18n

**Files:**
- Create: `apps/web/src/components/ThemeToggle.tsx`
- Create: `apps/web/src/components/ThemeToggle.test.tsx`
- Modify: `apps/web/src/components/Layout.tsx`
- Modify: `apps/web/src/i18n/en.json`, `pt-BR.json`

- [ ] **Step 1: Add i18n keys** (both locales; parity test will enforce)

`en.json` under `topbar`:

```json
"theme": "Theme",
"themeLight": "Light",
"themeDark": "Dark"
```

`pt-BR.json`:

```json
"theme": "Tema",
"themeLight": "Claro",
"themeDark": "Escuro"
```

- [ ] **Step 2: Write ThemeToggle test** (pattern after `LanguageToggle.test.tsx`)

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { ThemeToggle } from '../ThemeToggle.js';
import { i18n, ensureI18n } from '../i18n/index.js';
import { THEME_STORAGE_KEY } from '../theme/theme.js';

beforeEach(async () => {
  await ensureI18n();
  await i18n.changeLanguage('en');
  window.localStorage.removeItem(THEME_STORAGE_KEY);
  document.documentElement.setAttribute('data-theme', 'light');
});

it('switches to dark and persists', async () => {
  render(
    <I18nextProvider i18n={i18n}>
      <ThemeToggle />
    </I18nextProvider>,
  );
  await userEvent.click(screen.getByRole('button', { name: /theme/i }));
  await userEvent.click(screen.getByLabelText(/dark/i)); // or getByText
  expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
});
```

Adjust selectors to match the markup you implement. If `user-event` is awkward, use `fireEvent`.

- [ ] **Step 3: Implement ThemeToggle**

Simple two-option control (not a full menu required): button group or the same dropdown pattern as LanguageToggle. Calling `applyTheme('light'|'dark')` on change. Read current theme from `document.documentElement.getAttribute('data-theme')` or `resolveTheme()` + `useState`.

- [ ] **Step 4: Mount in Layout** next to `LanguageToggle` in the topbar actions row.

- [ ] **Step 5: Run tests + parity**

```bash
pnpm --filter @jheo/web test src/components/ThemeToggle.test.tsx src/i18n/parity.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ThemeToggle.tsx apps/web/src/components/ThemeToggle.test.tsx apps/web/src/components/Layout.tsx apps/web/src/i18n/en.json apps/web/src/i18n/pt-BR.json
git commit -m "feat(web): theme toggle in shell with i18n"
```

---

### Task 4: ScoreCard call-legibility pass

Minimal craft so the Dashboard’s primary number reads across a room.

**Files:**
- Modify: `apps/web/src/components/ScoreCard.tsx`
- Modify: `apps/web/test/scorecard.test.tsx` (update if selectors/text change)

- [ ] **Step 1: Restructure markup**

- Overall value: `className="scorecard__overall tabular"` with CSS `font-size: var(--fs-3xl); font-weight: 600; font-variant-numeric: tabular-nums;`
- Category labels stay uppercase short codes for now (S3 owns translated labels)
- Bars use `var(--accent)`; null categories stay muted track with `—`
- Wrapper: `className="card scorecard"`

Add to `styles.css`:

```css
.scorecard__overall {
  font-size: var(--fs-3xl);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  line-height: 1.1;
  margin: var(--space-1) 0 0;
}
```

- [ ] **Step 2: Run scorecard tests**

```bash
pnpm --filter @jheo/web test test/scorecard.test.tsx
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ScoreCard.tsx apps/web/src/styles.css apps/web/test/scorecard.test.tsx
git commit -m "feat(web): enlarge ScoreCard overall for client-call legibility"
```

---

### Task 5: Project Dashboard craft (reference surface)

**Owns:** hierarchy for the consultant scene; ErrorState on load/reAudit failures; no `window.alert`; empty pages state uses shared EmptyState when there are zero pages and no filter mismatch.

**Does not own:** deleting materials/channels/generations sections (keep below the fold or after primary ledger blocks); sidebar IA.

**Files:**
- Modify: `apps/web/src/pages/ProjectDashboard.tsx`
- Create: `apps/web/src/pages/__tests__/ProjectDashboard.test.tsx`

- [ ] **Step 1: Failing test — error path uses role=alert, not raw English dump**

Mock `getProject` to reject `new Error('backend_unavailable')`. Render dashboard inside QueryClient + Router + I18n (copy patterns from `ProjectsList.test.tsx` / `AuditRunner.test.tsx`). Assert `getByRole('alert')` and assert `queryByText('backend_unavailable')` is null.

- [ ] **Step 2: Implement error/loading/not-found**

Replace:

```tsx
if (project.isError) return <p>{t('projects.dashboard.failedToLoad')}</p>;
```

with `humanError` + `<ErrorState … onRetry={() => project.refetch()} />`.

Replace `reAudit.onError` `window.alert` with page-level error state:

```tsx
const [actionError, setActionError] = useState<unknown>(null);
// onError: (err) => setActionError(err)
// render ErrorState when actionError != null, onRetry clears or retries
```

- [ ] **Step 3: Hierarchy reorder (DOM order)**

1. Header (name, URL, primary **Run audit** CTA)
2. `ScoreCard`
3. Compact **Actions** row: links to compose / channels / materials (existing destinations) — secondary buttons, not competing with Run audit
4. Last-audit progress card (if any)
5. Filter + pages table
6. Diff modal (unchanged behavior)
7. Stat tiles + remaining F2/F3 lists **below** (demote visually with `className="dashboard__secondary"` and muted section label)

Add CSS:

```css
.dashboard__secondary {
  opacity: 0.92;
  padding-top: var(--space-4);
  border-top: 1px solid var(--border);
}
```

- [ ] **Step 4: Empty pages**

When `pages.data?.total === 0` and filter is `all`, show `<EmptyState titleKey="…" hintKey="…" cta={{ to: `/projects/${id}/audit`, labelKey: 'projects.dashboard.runAudit' }} />` instead of only an empty table row. Add keys to en + pt-BR if missing (`projects.dashboard.pagesEmpty.title` / `.hint`).

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @jheo/web test src/pages/__tests__/ProjectDashboard.test.tsx src/i18n/parity.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/ProjectDashboard.tsx apps/web/src/pages/__tests__/ProjectDashboard.test.tsx apps/web/src/styles.css apps/web/src/i18n/en.json apps/web/src/i18n/pt-BR.json
git commit -m "feat(web): craft Project Dashboard for Score Ledger call hierarchy"
```

---

### Task 6: Refresh DESIGN.md tokens from code

Seed → scan lite: replace `[to be resolved]` with the hex tables from Task 2. Keep six sections. Mark seed comment as resolved or remove `<!-- SEED -->`.

**Files:**
- Modify: `DESIGN.md`

- [ ] **Step 1: Update frontmatter** with `colors:` / `typography:` / `rounded:` / `spacing:` mirroring CSS (hex). Document both themes in Colors prose (light normative in YAML; dark listed in Colors section).

- [ ] **Step 2: Commit**

```bash
git add DESIGN.md
git commit -m "docs: promote DESIGN.md from seed to Score Ledger tokens"
```

---

### Task 7: SI acceptance gate

- [ ] **Step 1: Automated**

```bash
pnpm --filter @jheo/web test
pnpm --filter @jheo/web typecheck
```

Expected: PASS.

- [ ] **Step 2: Manual — The Score Ledger demo**

1. `pnpm run compose:down || true` then warm `docker compose … up -d` (or `pnpm run dev-up` if build is healthy).
2. `JHEO_API_PORT=8081 pnpm --filter @jheo/web dev` (match `docker/.env` API_PORT).
3. Open `http://127.0.0.1:5173` — **light** theme by default.
4. Open a project Dashboard: overall score reads large; Run audit is the dominant CTA; secondary blocks don’t overpower.
5. Toggle **Dark** — same layout, readable contrast, no emerald glow.
6. Reload — theme persists.
7. Force an API error (stop api container) — Dashboard/list shows human `errors.backend_down`, not raw sentinel.

- [ ] **Step 3: Mark SI complete** only if Step 1–2 pass. Note residual: non-Dashboard pages may look transitional until S2.

---

## Spec coverage

| SI requirement | Task |
|---|---|
| PRODUCT.md / DESIGN.md | Task 0 + 6 (teach already done) |
| CSS tokens from teach (not old emerald destiny) | Task 2 |
| Dual theme, default light | Task 1–3 |
| Project Dashboard reference craft | Task 4–5 |
| humanError / ErrorState on Dashboard | Task 5 |
| i18n en + pt-BR | Task 3, 5 |
| Critique / acceptance | Task 7 |
| Audit Results / sidebar / score.ts | Out of scope |

## Placeholder scan

No TBD steps. Hue values are locked in Task 2 tables.

## Type consistency

- `Theme = 'light' | 'dark'`
- Storage key `jheo.theme`
- DOM attribute `data-theme`
- CSS variables keep existing names (`--bg`, `--accent`, …) so consumers don’t rename en masse

## Next after SI

Brainstorm/plan **S2** (surfaces on SI tokens). Optional: `/impeccable critique` on Dashboard as a non-blocking quality pass inside Task 7.
