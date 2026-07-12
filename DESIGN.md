---
name: JHEO
description: Local audit → generate → publish tool for consultants defending scores on client calls.
<!-- SEED: re-run /impeccable document once SI tokens land in CSS to capture real values and components. -->
---

# Design System

## Overview

**Creative North Star: The Score Ledger.** A quiet product surface where the number, the evidence trail, and the next action read like a ledger opened in a briefing — calm, dense enough to be useful, never theatrical.

Philosophy: Restrained color (neutrals carry the UI; accent ≤10% for primary action and focus). One technical sans for all UI. Motion is responsive feedback only (150–250ms), never page choreography. Dual theme from day one; **default light** for afternoon / projector calls; dark is a peer theme with the same semantic tokens, not a neon alternate identity.

**The Ledger Rule.** If the score and the primary CTA are not the first things a client can read from across the room, the hierarchy failed.

## Colors

**The Restrained Rule.** Tinted neutrals do the work; one accent appears only on primary actions, selection, and focus. Never paint large surfaces with the accent. Never glow.

Hue family (seed): **cool slate / ink** neutrals with a single **ledger blue** accent — closer to Stripe/Linear quiet tools than to emerald “AI dashboard” chrome. Exact hex/OKLCH: `[to be resolved during SI token implementation]`.

Roles to resolve in implementation:

- Neutral canvas / elevated surface / border (light + dark pairs)
- Text primary / secondary / muted
- Accent (primary action) + accent-muted
- Semantic: success, warning, danger, info (for findings severity)

Forbidden: saturated neon accents, glow shadows on accent, purple-on-white SaaS defaults, warm cream + terracotta “AI editorial” clichés.

## Typography

**The Single Sans Rule.** One technical sans for headings, labels, body, and UI chrome — Linear-like clarity, fixed rem scale (~1.125–1.2 ratio), no display face, no fluid clamp headings in the app shell.

Score and tabular data use `font-variant-numeric: tabular-nums` (and mono only if a denser numeral stack is required later — not the default seed).

Exact family stack: `[font pairing to be chosen at implementation]` (system-ui / Inter-class technical sans is on-brand for product register).

## Elevation

**The Tonal Stack Rule.** Prefer layered surfaces (canvas → panel → elevated) over drop-shadow theater. Shadows, if any, are soft and structural — not glow. Flat by default; lift only to separate interactive layers.

Inferred from responsive (not choreographed) motion: no parallax, no staged entrance cascades.

## Components

Omitted in seed — no component contracts until SI implements tokens and the Project Dashboard reference. Next document/scan pass should capture button, input, empty/error state, score card, and shell (sidebar/topbar) from code.

## Do's and Don'ts

**Do**

- Open in **light** theme by default; persist user theme choice once the toggle exists.
- Keep accent usage sparse; let neutrals and type hierarchy carry calm.
- Design the Project Dashboard so score → actions → history survive a projected client call.
- Use the same semantic token names in light and dark.

**Don't**

- Dashboard SaaS genérico dark com neon/glow (PRODUCT anti-reference).
- Relatório PowerPoint de “consultoria clássica” — slides densos, decoração vazia (PRODUCT anti-reference).
- Invent affordances; reuse product-familiar patterns (shell, lists, empty/error).
- Animate for decoration; motion only for state and feedback.
