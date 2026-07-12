---
name: JHEO
description: Local audit → generate → publish tool for consultants defending scores on client calls.
# Tokens sourced from apps/web/src/styles.css (:root light normative; [data-theme="dark"] overrides below).
colors:
  bg: "#f4f6f9"
  surface: "#ffffff"
  surface_2: "#eef1f6"
  surface_3: "#e2e8f0"
  bg_elevated: "#eef1f6"
  border: "#d8dee8"
  border_strong: "#b8c0d0"
  text: "#0f172a"
  text_dim: "#475569"
  text_muted: "#64748b"
  accent: "#2563eb"
  accent_dim: "#1d4ed8"
  accent_bright: "#3b82f6"
  success: "#15803d"
  warning: "#b45309"
  danger: "#b91c1c"
  info: "#1d4ed8"
  severity:
    info: "#60a5fa"
    warn: "#fbbf24"
    error: "#f87171"
  dark:
    bg: "#0b1220"
    surface: "#121a2b"
    surface_2: "#1a2438"
    surface_3: "#243049"
    bg_elevated: "#1a2438"
    border: "#2a364d"
    border_strong: "#3d4d6b"
    text: "#e8eef8"
    text_dim: "#9aa8c0"
    text_muted: "#6b7a94"
    accent: "#3b82f6"
    accent_dim: "#2563eb"
    accent_bright: "#60a5fa"
    success: "#22c55e"
    warning: "#fbbf24"
    danger: "#f87171"
    info: "#60a5fa"
typography:
  font_sans: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
  font_mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace"
  scale:
    xs: 11px
    sm: 12.5px
    base: 13.5px
    md: 14px
    lg: 16px
    xl: 20px
    2xl: 26px
    3xl: 34px
rounded:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 20px
  pill: 999px
spacing:
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  5: 20px
  6: 24px
  8: 32px
  10: 40px
  12: 48px
  16: 64px
---

# Design System

## Overview

**Creative North Star: The Score Ledger.** A quiet product surface where the number, the evidence trail, and the next action read like a ledger opened in a briefing — calm, dense enough to be useful, never theatrical.

Philosophy: Restrained color (neutrals carry the UI; accent ≤10% for primary action and focus). One technical sans for all UI. Motion is responsive feedback only (150–250ms), never page choreography. Dual theme from day one; **default light** for afternoon / projector calls; dark is a peer theme with the same semantic tokens, not a neon alternate identity.

**The Ledger Rule.** If the score and the primary CTA are not the first things a client can read from across the room, the hierarchy failed.

## Colors

**The Restrained Rule.** Tinted neutrals do the work; one accent appears only on primary actions, selection, and focus. Never paint large surfaces with the accent. Never glow.

Hue family: **cool slate / ink** neutrals with a single **ledger blue** accent (`#2563eb`) — closer to Stripe/Linear quiet tools than to emerald "AI dashboard" chrome. Light values are normative (frontmatter); dark is a peer theme using the same token names.

| Token | Light (normative) | Dark |
|---|---|---|
| `--bg` (canvas) | `#f4f6f9` | `#0b1220` |
| `--surface` | `#ffffff` | `#121a2b` |
| `--surface-2` | `#eef1f6` | `#1a2438` |
| `--surface-3` | `#e2e8f0` | `#243049` |
| `--bg-elevated` | `#eef1f6` | `#1a2438` |
| `--border` | `#d8dee8` | `#2a364d` |
| `--border-strong` | `#b8c0d0` | `#3d4d6b` |
| `--text` | `#0f172a` | `#e8eef8` |
| `--text-dim` | `#475569` | `#9aa8c0` |
| `--text-muted` | `#64748b` | `#6b7a94` |
| `--accent` | `#2563eb` | `#3b82f6` |
| `--accent-dim` | `#1d4ed8` | `#2563eb` |
| `--accent-bright` | `#3b82f6` | `#60a5fa` |
| `--success` | `#15803d` | `#22c55e` |
| `--warning` | `#b45309` | `#fbbf24` |
| `--danger` | `#b91c1c` | `#f87171` |
| `--info` | `#1d4ed8` | `#60a5fa` |

Findings severity (used on `.sev`, `.fixgroup`, `.fixcard` left borders): `--sev-info #60a5fa`, `--sev-warn #fbbf24`, `--sev-error #f87171` (shared across themes; severity colors are not overridden in dark).

Accent glow is a translucent fill of the accent (`rgba(37,99,235,0.12)` light / `rgba(59,130,246,0.18)` dark) used for selection and focus backdrops only — never as a large surface.

Forbidden: saturated neon accents, glow shadows on accent, purple-on-white SaaS defaults, warm cream + terracotta "AI editorial" clichés.

## Typography

**The Single Sans Rule.** One technical sans for headings, labels, body, and UI chrome — Linear-like clarity, fixed px scale, no display face, no fluid clamp headings in the app shell.

Family stack: `'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` (mono: `'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace`).

Scale: `xs 11px`, `sm 12.5px`, `base 13.5px` (body), `md 14px`, `lg 16px`, `xl 20px`, `2xl 26px`, `3xl 34px`.

Score and tabular data use `font-variant-numeric: tabular-nums` (mono only where a denser numeral stack is required — `.fixgroup__meta code`, `.fm-table dd`).

## Elevation

**The Tonal Stack Rule.** Prefer layered surfaces (canvas `#f4f6f9` → panel `#ffffff` → elevated `#eef1f6`) over drop-shadow theater. Shadows, if any, are soft and structural — not glow. Flat by default; lift only to separate interactive layers.

Shadows from CSS: `--shadow-sm` (subtle), `--shadow-md` (cards/score--hero), `--shadow-lg` (dialogs); `--shadow-accent` is a 1px ring in `--border-strong`, never a colored glow.

Inferred from responsive (not choreographed) motion: no parallax, no staged entrance cascades.

## Components

Component contracts live in `apps/web/src/styles.css` as visual primitives that pages compose. Reference set: `.btn` (+ `--primary/--secondary/--ghost/--danger`, `--sm/--lg`), `.input`/`.select`/`.textarea`, `.card`, `.badge` (+ status/category variants), `.score` (+ `--hero`), `.scorecard__overall`, `.table`, `.finding`/`.finding-list`, `.empty` (+ inline SVG art), `.skeleton`, `.fixgroup`/`.fixcard`, `.modal`, `.filter-bar__chip`, `.tag`, `.spinner`, `.diff-badge`. Shell: `.app-shell` grid + `.sidebar` + `.topbar`.

## Do's and Don'ts

**Do**

- Open in **light** theme by default; persist user theme choice once the toggle exists.
- Keep accent usage sparse; let neutrals and type hierarchy carry calm.
- Design the Project Dashboard so score → actions → history survive a projected client call.
- Use the same semantic token names in light and dark.

**Don't**

- Dashboard SaaS genérico dark com neon/glow (PRODUCT anti-reference).
- Relatório PowerPoint de "consultoria clássica" — slides densos, decoração vazia (PRODUCT anti-reference).
- Invent affordances; reuse product-familiar patterns (shell, lists, empty/error).
- Animate for decoration; motion only for state and feedback.
