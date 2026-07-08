# F7 — Autonomous SEO/GEO Fix Suggester — Design

**Date:** 2026-07-08
**Status:** Draft (brainstormed, awaiting user review)
**Milestone:** F7
**Author:** jhowtkd
**Predecessor:** F1–F3 (shipped), F-Hardening (shipped), F5 (shipped), F6 (in review/merge)

---

## 1. Problem

JHEO today **detects** SEO/GEO problems — F1 produces Findings with category,
severity, message, and a numeric score; the operator sees them in the SPA and
in the JSON API. F2 generates content, F3 distributes it.

What JHEO does **not** do is help the operator close the loop between "we have
a finding" and "we have a concrete patch I can show the client". Today the
operator has to:

1. Open the finding
2. Open the page in a browser / read the HTML
3. Think about what to change
4. Manually write the new meta tag / heading / schema / copy
5. Apply it on the client side (WP edit, git commit, manual paste)
6. Re-audit the page to confirm the fix landed

Steps 1–4 are exactly the part an LLM can do well, given context the audit
already collected. Steps 5–6 are the part where the human must stay in the
loop (side-effects, business judgment). F7 automates 1–4 by **recommending**
a patch, then **validates** step 6 by re-auditing after the operator accepts
(step 5 is the operator's responsibility).

The result is an operator who, on a typical audit, can go from "50 findings
across 12 pages" to "50 ranked suggestions, of which I accept 20" to "20
re-audits in flight, results back in a few minutes" — without leaving JHEO.

---

## 2. Goals

- For every **page-scoped** Finding in a completed audit, the operator can
  request an LLM-generated suggestion via a button in the SPA. The response
  is a `(before, after, confidence, rationale)` tuple where:
  - `before` is the relevant slice of the current page (meta tag, heading,
    JSON-LD block, copy paragraph, etc.)
  - `after` is the LLM's proposed replacement
  - `confidence` is one of `low | medium | high`
  - `rationale` is a one-sentence plain-language explanation in the
    operator's UI locale
- Suggestions render in the SPA as a diff (inline by default, side-by-side
  toggle) with a confidence chip and a one-click Accept / Reject / Regenerate
  action row.
- Accepting a suggestion marks it `accepted`, records `decidedAt`, and
  **enqueues exactly one re-audit** of the page the finding was attached to.
  The re-audit inherits configuration from the original audit (same crawler
  settings, same locale). If a re-audit is already queued or running for
  that page, the existing one is reused (no duplicate jobs).
- Rejecting a suggestion is final-but-revisitable: the operator can
  Regenerate to overwrite a `pending` suggestion, but cannot un-reject
  (`rejected` is terminal in F7).
- All chrome and rationale strings are i18n-aware (en + pt-BR) following the
  F6 convention; rationale language follows the operator's UI locale.
- The 6 audit categories all get a tailored prompt and a tailored context
  builder slice: **seo, geo, cwv, a11y, content, overall** (overall is
  blocked at the route level — see §6.4 R-4).
- The new functionality lives in core (`packages/core/src/suggestions/`) and
  reuses existing infrastructure (LLM provider from F2, re-audit queue from
  F5.4, plain-language system prompt register from F6, rate limit from F6,
  i18n catalogs from F6). No parallel implementations.

---

## 3. Non-Goals

- **No side-effects on the client site.** F7 does not write to WordPress, push
  to git, hit any HTTP publisher, or modify any external state. The operator
  applies the patch out-of-band.
- **No closed-loop auto-correction.** Each acceptance triggers **one**
  re-audit. Iteration ("accept, see it didn't help, accept a new variant,
  re-audit again") is a human-driven loop in F7. A truly autonomous
  "detect → fix → verify → repeat until convergence" loop is a separate,
  later milestone.
- **No proactive auto-suggestion.** Suggestions are only generated when the
  operator explicitly clicks. There is no "after audit completion,
  auto-suggest all findings" background job in F7.
- **No batch / bulk operations.** F7 is one-click-per-finding. A
  "suggest all findings on this page" or "suggest all critical findings"
  shortcut is a later milestone and reuses the F7 primitive.
- **No suggestions for category-`overall` findings or any finding without a
  `pageId`.** F7 is page-scoped. Global findings are blocked with 422 and a
  clear message; F8 may add a "global suggestions" panel.
- **No perfect CWV suggestions.** CWV findings (CLS, LCP, TBT) often do not
  have a snippet-style fix; F7 produces a best-effort textual suggestion
  ("compress /assets/hero.png from 240KB to < 100KB") and the operator
  should treat CWV suggestions as advisory, not as diffs.
- **No new auth, multi-tenant, or per-user model.** F7 inherits F6's
  single-user, single-locale-browser premise.
- **No new translation pipeline.** If the LLM produces rationale in the
  wrong locale, the UI shows it as-is; F7 does not post-translate via
  `/api/translate`. F8 may add that as a polish step.
- **No mobile-first redesign.** The SPA's existing desktop layout is the
  target. pt-BR stakeholders consume the **output** (e.g. exported report),
  not the SPA.

---

## 4. Architecture

### 4.1 Component overview

```
┌──────────────────────────────────────────────────────────────────┐
│ apps/web (React SPA)                                              │
│ ┌─────────────────────┐  ┌──────────────────────────────┐        │
│ │ FixesPage           │  │ AuditDetailPage              │        │
│ │ /app/fixes          │  │ /app/audits/:id              │        │
│ │ filters + cards     │  │ "Suggest fix" button on      │        │
│ │                     │  │ each Finding card →          │        │
│ │                     │  │ pre-filters /app/fixes       │        │
│ └──────────┬──────────┘  └──────────┬───────────────────┘        │
│            │                        │                            │
│            │ createSuggestion()     │                            │
│            │ acceptSuggestion()     │                            │
│            │ rejectSuggestion()     │                            │
│            ▼                        ▼                            │
│       apps/web/src/api.ts (typed client, no fetch scattered)      │
└─────────────────────────────┬────────────────────────────────────┘
                              │ HTTP
┌─────────────────────────────▼────────────────────────────────────┐
│ apps/api (Fastify)                                                │
│ ┌──────────────────────────────────────────────────────────┐     │
│ │ routes/suggestions.ts                                     │     │
│ │  POST   /api/suggestions           (create)              │     │
│ │  GET    /api/suggestions?findingId  (list per finding)    │     │
│ │  GET    /api/suggestions/:id        (detail)             │     │
│ │  POST   /api/suggestions/:id/accept (accept + enqueue)    │     │
│ │  POST   /api/suggestions/:id/reject (reject)             │     │
│ └──────────────────────────────┬───────────────────────────────┘     │
│                                │                                   │
│                                │ runSuggestion(provider, context)   │
│                                ▼                                   │
│                       packages/core/src/suggestions/               │
│                       ┌────────────────────────────────┐            │
│                       │ buildSuggestionContext()       │            │
│                       │ prompts/{seo,geo,cwv,a11y,     │            │
│                       │           content,overall}.ts  │            │
│                       │ runSuggestion()                │            │
│                       │ suggestionOutputSchema (Zod)   │            │
│                       └────────────────────────────────┘            │
│                                                                  │
│  accept() → POST /api/pages/:id/audit                            │
│              (F5.4 route, called internally)                       │
│                                                                  │
│  rate limit plugin (F6 helper) + i18n hook (F6)                   │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                ┌──────────────────────────────┐
                │ Postgres (Prisma)             │
                │  + new Suggestion table      │
                │                              │
                │ Redis (BullMQ)               │
                │  + reuses re-audit queue     │
                └──────────────────────────────┘
```

### 4.2 Why this shape

- **Core stays infra-free.** All LLM-prompt-orchestration logic lives in
  `packages/core`. The core module imports nothing from `apps/`, no Prisma,
  no BullMQ, no Fastify. This is the same invariant that
  `runGeneration` and `runTranslation` already satisfy (F2 + F6).
- **API is thin.** Routes are 1:1 with HTTP verbs; everything interesting is
  delegated to `runSuggestion`. This is the same shape F6 used for
  `/api/translate`.
- **Re-audit reuse, not reimplementation.** F5.4 already enqueues
  re-audits via `POST /api/pages/:id/audit`. F7 calls the same route
  internally with the finding's `pageId`. No new queue, no new worker,
  no new state machine. The "re-audit in progress → 409" handling
  lives in F5.4; F7 just translates the 409 into a returned
  `reAuditId` of the in-progress audit.
- **LLM provider injection, not hard-import.** `runSuggestion` accepts a
  `provider` argument in the same shape as F2's `runGeneration` and F6's
  `runTranslation`. Tests use a fake provider; production uses whatever
  the user has configured for `OPENAI_API_KEY` (or compatible).

---

## 5. Data model

### 5.1 New Prisma model

```prisma
model Suggestion {
  id          String   @id @default(cuid())
  findingId   String
  finding     Finding  @relation(fields: [findingId], references: [id], onDelete: Cascade)
  kind        String   // "snippet" — F7 only ships snippet format
  category    String   // mirrors Finding.category at creation time
  before      String   @db.Text
  after       String   @db.Text
  confidence  String   // "low" | "medium" | "high"
  rationale   String   @db.Text
  locale      String   // "en" | "pt-BR"
  status      String   @default("pending") // pending|accepted|rejected|superseded
  model       String   // e.g. "openai:gpt-4o-mini"
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  decidedAt   DateTime?

  @@unique([findingId, status])
  @@index([findingId])
  @@index([status])
}
```

And the back-relation on `Finding`:

```prisma
model Finding {
  // ... existing fields ...
  suggestions Suggestion[]
}
```

### 5.2 Why these choices

- **`@@unique([findingId, status])`** — implements the idempotency rule
  "at most one suggestion per status per finding". The route uses
  `status='pending'` as the lookup key; double-clicks during a generation
  return the in-flight record instead of creating a duplicate.
  - **Trade-off:** Prisma has no partial unique indexes, so this index
    also constrains "at most one accepted suggestion per finding" and "at
    most one rejected". The route enforces the natural flow (pending →
    accepted/rejected → superseded when re-generated) inside a transaction.
    This is acceptable for F7. If F8 needs full history it can drop this
    constraint and use a different table layout.
- **`@db.Text`** — `before`/`after` are bounded only by what the LLM
  produces, which for HTML/JSON-LD can run into the tens of KB. `@db.Text`
  is unbounded in Postgres and cheap to read.
- **`confidence` as `String`, not enum** — F1 deliberately keeps several
  such fields as `String` with documented values (see `progress.md` for F3
  review of this pattern). This is a single-user local tool, not a
  high-integrity multi-tenant DB. The route validates the value against
  the Zod enum at the boundary.
- **`locale` on the suggestion, not the finding** — Finding does not yet
  have a `locale` column (F6 added locale awareness to Generation and to
  the API contract, not to Finding). The suggestion captures the locale
  it was produced in. Future migrations can denormalize if needed.
- **`model` as `String`** — same auditability rationale as `Generation`.
- **`onDelete: Cascade`** — when a finding is deleted (rare, but possible
  during test cleanup), its suggestions go with it.

### 5.3 Migration

Generated with `prisma migrate dev --name add-suggestion`. If F6's
baseline-migration followup has been completed, this runs cleanly;
otherwise fall back to the F6 hand-author pattern: `prisma migrate diff
--from-migrations <prev> --to-schema-datamodel ./schema.prisma --script`
→ write to a new migration file under `prisma/migrations/`, then
`prisma migrate deploy`.

---

## 6. Backend

### 6.1 Endpoints

| Method | Path | Body / Query | Success | Errors |
|---|---|---|---|---|
| POST | `/api/suggestions` | `{ findingId, locale? }` | 201 + Suggestion | 400, 404, 409, 422, 429, 502 |
| GET  | `/api/suggestions` | `?findingId=...` | 200 + Suggestion[] | 400 |
| GET  | `/api/suggestions/:id` | — | 200 + Suggestion | 404 |
| POST | `/api/suggestions/:id/accept` | — | 200 + `{ suggestion, reAuditId }` | 404, 409, 502 |
| POST | `/api/suggestions/:id/reject` | — | 200 + Suggestion | 404, 409 |

All endpoints require `x-project-id` header (F3 project-scoping
invariant; the route derives project from the finding's page → project
chain and rejects mismatches).

### 6.2 `POST /api/suggestions` flow

```
1. Validate body with Zod:
   { findingId: cuid, locale?: 'en' | 'pt-BR' }
2. Load Finding (404 if absent) — must have pageId, page must have
   htmlSnapshot (422 with code FINDING_NOT_PAGE_SCOPED or
   PAGE_HTML_MISSING)
3. Resolve project from finding.page.projectId
4. Verify x-project-id header matches (F3 invariant)
5. Resolve locale: req.locale (F6 hook) > body.locale > project default
6. Idempotency check:
   a. SELECT existing WHERE findingId AND status='pending'
   b. If exists AND createdAt > now - 5min  → return it (200, not 201)
   c. If exists AND createdAt ≤ now - 5min → mark superseded in tx,
      continue to step 7
   d. If not exists → continue
7. Build SuggestionContext:
   - finding.message, category, severity
   - page.url
   - htmlSlice: page.htmlSnapshot trimmed by category (see §6.5)
   - gscSnapshot: if Project has GSC data for page.url, include
     {impressions, ctr, position} averages; otherwise omit
8. Call runSuggestion(provider, context, locale)
9. If output fails Zod → 502 with code LLM_OUTPUT_INVALID; no persist
10. Persist Suggestion (status='pending')
11. Return 201
```

### 6.3 `POST /api/suggestions/:id/accept` flow

```
1. Load Suggestion (404 if absent)
2. Verify status === 'pending' (409 with code ALREADY_DECIDED)
3. Verify x-project-id matches the suggestion's project chain
4. In a transaction:
   a. UPDATE suggestion SET status='accepted', decidedAt=now()
5. Resolve pageId (finding → page)
6. Call the F5.4 re-audit primitive — `POST /api/pages/:id/audit`:
   a. If it returns 200 with { pageAuditId } → re-audit enqueued
   b. If it returns 409 with "re-audit in progress" → fetch the
      existing pageAuditId and return it (no second enqueue)
7. Return 200 with { suggestion, reAuditId: pageAuditId }
```

Notes:
- F7 calls the F5.4 route internally (same Fastify instance) rather
  than a free-standing function. F5.4's `apps/api/src/routes/pages.ts`
  is the single source of truth for "enqueue a standalone re-audit";
  F7 does not reimplement the in-progress check.
- The "fetch the existing pageAuditId on 409" branch requires a
  `GET /api/page-audits?projectPageId=...&status=in-progress` lookup
  OR extracting the helper. The implementing plan (§9 Task 7) will
  pick the lighter option; either way the route returns the existing
  `reAuditId` to the operator and does not block.

`POST /api/suggestions/:id/reject` is the same minus step 6 (no
enqueue).

### 6.4 Error codes (structured)

| HTTP | code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | Zod body / query failed |
| 404 | NOT_FOUND | Finding or Suggestion does not exist |
| 404 | PROJECT_MISMATCH | x-project-id header does not match the chain |
| 409 | ALREADY_DECIDED | Accept/Reject on a non-pending Suggestion |
| 422 | FINDING_NOT_PAGE_SCOPED | Finding has no pageId (e.g. overall) |
| 422 | PAGE_HTML_MISSING | Page has no htmlSnapshot |
| 429 | RATE_LIMITED | Per-IP rate limit (F6 helper, 10 req/min) |
| 502 | LLM_OUTPUT_INVALID | LLM returned JSON that failed Zod validation |
| 502 | LLM_UNAVAILABLE | Provider error (network, 5xx) |

### 6.5 `buildSuggestionContext` (core, pure)

Takes a Finding + Page + optional GSC snapshot + locale, returns:

```ts
type SuggestionContext = {
  category: 'seo' | 'geo' | 'cwv' | 'a11y' | 'content' | 'overall';
  severity: string;
  findingMessage: string;
  pageUrl: string;
  htmlSlice: string;        // category-aware truncation, max ~8KB
  gsc?: { impressions: number; ctr: number; position: number };
  locale: 'en' | 'pt-BR';
};
```

`htmlSlice` strategy per category:
- `seo`: extract `<head>` and the first `<h1>` if present.
- `geo`: extract `<head>`, any `<script type="application/ld+json">` blocks,
  `llms.txt` if linked, and the first 1KB of body.
- `cwv`: extract the relevant node based on finding.message regex
  (image src for LCP, script src for TBT, etc.). Fall back to first 1KB
  of `<body>`.
- `a11y`: extract the relevant DOM subtree by id/class hints in
  finding.message; fall back to first 2KB of body.
- `content`: first 4KB of body.
- `overall`: empty string + early-return with error
  `FINDING_NOT_PAGE_SCOPED`.

### 6.6 Prompt files (core)

```
packages/core/src/suggestions/prompts/
  seo.ts
  geo.ts
  cwv.ts
  a11y.ts
  content.ts
  overall.ts   // never used by F7; reserved for F8 global panel
```

Each file exports a `buildXxxPrompt(context): string` function. The prompt
template:
1. **Persona:** "You are a senior technical SEO consultant working with a
   Portuguese-speaking client. Your recommendations must be safe,
   evidence-based, and never invent URLs, schema fields, or facts not in
   the input."
2. **Plain-language rule** (from F6 register): "The `rationale` field must
   be one short sentence in the operator's locale, using everyday words.
   No marketing jargon, no enterprise-speak."
3. **Output format:** strict JSON with fields `before`, `after`,
   `confidence`, `rationale`. The `after` field must be ready to paste —
   no markdown fences, no commentary.
4. **Locale enforcement:** the rationale must be in `context.locale`.
5. **Confidence rubric:** low = "I am guessing, the evidence is thin";
   medium = "this is a standard fix and the inputs support it"; high =
   "this is unambiguous and the fix is mechanical".
6. **Hard constraints:** max 280 chars on `rationale`; `after` length
   bounded by the category's typical scope (meta ≤ 200 chars,
   JSON-LD ≤ 8KB, paragraph ≤ 1KB, etc.).

### 6.7 `runSuggestion` (core)

```ts
async function runSuggestion(
  provider: LlmProvider,
  context: SuggestionContext,
): Promise<{ before: string; after: string; confidence: 'low'|'medium'|'high'; rationale: string }>
```

- Selects prompt by `context.category` (rejects `overall` with throw
  `Error('CATEGORY_NOT_SUPPORTED')`).
- Calls `provider.complete({ system: prompt, user: serializeContext(context) })`.
- Parses response as JSON, validates with `suggestionOutputSchema` (Zod).
- Throws `LlmOutputError` on validation failure with the raw response
  attached.
- Pure: no DB, no FS, no clock. Time-based "freshness" lives in the
  route layer.

### 6.8 Rate limiting and locale

- Reuse the F6 rate-limit plugin (10 req/min/IP) on the create route.
- Reuse the F6 `req.locale` hook for the default-locale resolution.
- i18n keys for error messages live in
  `apps/web/src/i18n/catalogs/{en,pt-BR}.json` (parity test from F6
  covers new keys).

---

## 7. Frontend

### 7.1 New route and sidebar entry

- Route: `/app/fixes` (registered in `apps/web/src/routes.tsx`, lazy
  loaded).
- Sidebar link: "Correções" (i18n key `nav.fixes`), placed under
  "Audits" and before "Templates".
- Cross-link from `AuditDetailPage`: each finding card grows a button
  "Sugerir correção" that navigates to `/app/fixes?findingId=...` with
  the page pre-filtered to that finding.

### 7.2 Page layout

```
┌──────────────────────────────────────────────────────────────┐
│ Fixes                                                        │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐   │
│ │ Filtros                                               │   │
│ │ [Projeto ▾]  [Audit ▾]  [Categoria ▾]  [Status ▾]    │   │
│ └────────────────────────────────────────────────────────┘   │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐   │
│ │ Finding: "Meta description is missing"                 │   │
│ │ [seo] [warning]              [page url]                │   │
│ │                                                        │   │
│ │ ─ before ─────────────────────────────────────────    │   │
│ │   <head>...</head>                                     │   │
│ │ ─ after ──────────────────────────────────────────     │   │
│ │   <head>...<meta name="description" content="..."/>    │   │
│ │                                                        │   │
│ │ [medium]  "Adiciona uma descrição curta..."            │   │
│ │ model: openai:gpt-4o-mini  ·  pt-BR  ·  há 2 min     │   │
│ │                                                        │   │
│ │ [Aceitar]  [Rejeitar]  [Regenerar]  [Ver diff lado-a-  │   │
│ │                                       lado ↔]          │   │
│ └────────────────────────────────────────────────────────┘   │
│                                                              │
│ ... more cards ...                                           │
│                                                              │
│ (empty state: "Nenhum finding pendente. Rode um audit.")      │
└──────────────────────────────────────────────────────────────┘
```

For a finding **without** an existing suggestion, the card collapses to
a single button:

```
┌────────────────────────────────────────────────────────────┐
│ Finding: "Meta description is missing"   [seo] [warning]   │
│ Página: https://example.com/                               │
│                                              [Gerar ↗]     │
└────────────────────────────────────────────────────────────┘
```

### 7.3 Components (apps/web/src/components/fixes/)

| File | Purpose |
|---|---|
| `FixesPage.tsx` | Page entry; owns filters, fetch, and state machine |
| `FixCard.tsx` | One card; stateless; receives Finding + optional Suggestion |
| `DiffView.tsx` | Renders before/after as inline diff (default) or side-by-side |
| `ConfidenceChip.tsx` | Colored chip with i18n label for low/med/high |
| `SuggestionActions.tsx` | Accept / Reject / Regenerate button row |
| `EmptyFixesState.tsx` | Empty state when no findings match filters |

### 7.4 State machine (per card)

```
           ┌────────────┐
   click   │            │  POST /api/suggestions
  "Gerar"  │  no sugg.  │ ─────────────────────► generating
   ──────► │            │                          │
           └────────────┘                          │
                                                   ▼
                            ┌────────────┐    ┌─────────┐
                            │  rejected  │    │ pending │
                            │  (term.)   │◄───┤         │◄─── Regenerate
                            └────────────┘    │         │
                                               │         │ ──── Accept ─►
                                               │         │       enqueue re-audit
                                               │         │       status: accepted
                                               └─────────┘
```

The card's `Regenerate` button is only enabled when status === `pending`.
A click calls `POST /api/suggestions` again; the route's idempotency
rule handles the swap (the old pending becomes `superseded`, a new one
appears).

### 7.5 API client additions (apps/web/src/api.ts)

```ts
type Suggestion = { /* matches DB shape, with Date as string */ };

function createSuggestion(body: { findingId: string; locale?: 'en' | 'pt-BR' }): Promise<Suggestion>;
function listSuggestions(findingId: string): Promise<Suggestion[]>;
function getSuggestion(id: string): Promise<Suggestion>;
function acceptSuggestion(id: string): Promise<{ suggestion: Suggestion; reAuditId: string | null }>;
function rejectSuggestion(id: string): Promise<Suggestion>;
```

All functions typed, no `any`, no `as unknown as`. Errors are surfaced
as thrown `Error` with the structured `code` from the API in `.message`
when available.

### 7.6 i18n keys (en/pt-BR parity)

New keys, all with parity test:
- `nav.fixes`
- `fixes.title`, `fixes.empty`
- `fixes.filter.project`, `fixes.filter.audit`, `fixes.filter.category`, `fixes.filter.status`
- `fixes.status.pending`, `fixes.status.accepted`, `fixes.status.rejected`, `fixes.status.superseded`
- `fixes.action.generate`, `fixes.action.accept`, `fixes.action.reject`, `fixes.action.regenerate`
- `fixes.confidence.low`, `fixes.confidence.medium`, `fixes.confidence.high`
- `fixes.diff.inline`, `fixes.diff.sideBySide`
- `fixes.error.findingNotPageScoped`, `fixes.error.pageHtmlMissing`, `fixes.error.llmInvalid`, `fixes.error.rateLimited`

### 7.7 Cross-link from AuditDetail

In `AuditDetailPage.tsx`, the existing Finding card grows a small button
"Sugerir correção" that, when clicked, calls
`navigate(\`/app/fixes?findingId=${finding.id}\`)`. The `FixesPage` reads
the query string and pre-applies the filter. No state coupling between
pages.

---

## 8. Testing strategy

### 8.1 Coverage matrix

| Layer | Tooling | Cases |
|---|---|---|
| `packages/core/src/suggestions/*` | Vitest, no DB | Output schema (valid/invalid), context builder per category, runSuggestion with fake provider, prompt file imports, locale enforcement, rationale length cap, `overall` category throws |
| `apps/api/src/routes/suggestions.ts` | Vitest + `buildServer` + `canRunDb` skip | Happy path per category, idempotency in 5min window, idempotency after 5min (superseded), accept enqueues re-audit, accept on decided returns 409, reject does not enqueue, finding without pageId → 422, page without htmlSnapshot → 422, LLM output invalid → 502, rate limit returns 429 |
| `apps/web/src/components/fixes/*` | Vitest + jsdom + RTL | FixCard empty / pending / accepted / rejected / superseded states; DiffView inline vs side-by-side; ConfidenceChip colors; SuggestionActions disabled rules |
| `apps/web/src/pages/FixesPage.tsx` | Vitest + jsdom | Filters apply, empty state, navigate from query string works |
| i18n | Vitest | Parity test asserts every key in en exists in pt-BR (and vice-versa) — extends the F6 parity test |
| End-to-end smoke | `apps/api/test/jobs/f3-smoke.test.ts` (extended) | 1 unconditional + 1 DB-gated: create project/audit/seed-finding → POST suggestion → accept → verify re-audit in queue |

### 8.2 TDD ordering (per task)

1. Write the failing test.
2. Make it green with the minimum code.
3. Refactor while green.
4. Commit. Repeat.

This is the convention F5/F6 already follow; F7 does not invent a new
test discipline.

### 8.3 Mocking

- **LLM:** tests inject a fake `LlmProvider` that returns canned JSON or
  intentionally malformed output. No real network calls in CI.
- **DB:** DB-gated tests use the existing `canRunDb` precheck (F2
  pattern). Schema migrations run in test setup.
- **BullMQ:** `enqueueReAudit` is spied on (not mocked at the network
  level). The route does not import BullMQ directly.
- **Time:** freshness window (5min) is parameterized via a `clock`
  argument to the route, defaulting to `Date.now`. Tests pass a
  controlled clock to exercise the "5 minutes later" branch without
  sleeping.

---

## 9. Implementation plan (15 tasks, TDD)

Each task is one or more commits, one or more tests, with a green
typecheck and green tests at the end.

1. **Schema + migration.** Add `Suggestion` model + back-relation on
   `Finding`. Run `prisma migrate dev` (or F6's hand-author fallback).
   Add a baseline-migration followup if F6 did not land it.
2. **Core: `suggestionOutputSchema` (Zod).** Pure schema with rationale
   length cap, confidence enum, locale enum.
3. **Core: `buildSuggestionContext`.** Pure function. Tests for each
   category, including `overall` early-return and HTML-truncation
   edge cases.
4. **Core: 6 prompt files.** One per category. Tests assert locale
   enforcement, output format, and constraints.
5. **Core: `runSuggestion`.** Orchestrates provider call + Zod parse.
   Tests with fake provider (happy + LlmOutputError paths).
6. **API: `POST /api/suggestions` + `GET /api/suggestions` + detail.**
   Idempotency, error mapping, locale resolution. DB-gated tests.
7. **API: `POST /api/suggestions/:id/accept` + `/reject`.** Atomic
   state transition. Spy on `enqueueReAudit`.
8. **API: rate limit + i18n hook on the route.** Reuse F6 helpers.
9. **Web: i18n catalogs (en + pt-BR) + parity test extension.** New
   keys from §7.6.
10. **Web: `api.ts` additions** — typed client, no `any`.
11. **Web: `DiffView` + `ConfidenceChip`.** Pure presentational, easy
    to test.
12. **Web: `FixCard` + `SuggestionActions`.** Card state machine from
    §7.4.
13. **Web: `FixesPage` + sidebar entry + route registration.** Filters,
    empty state, query-string pre-filter.
14. **Web: cross-link button on `AuditDetailPage`.** One button per
    finding card; navigate to `/app/fixes?findingId=...`.
15. **Smoke E2E + README bring-up notes.** Extend `f3-smoke.test.ts`
    with 1 unconditional + 1 DB-gated case; append F7 section to
    `README.md`.

### 9.1 Estimated effort

Rough sizing per task (1 = trivial, 5 = largest in F5/F6):
- Tasks 1, 2, 3, 4, 5, 9, 10: each ~2
- Tasks 6, 7, 11, 12, 13, 14, 15: each ~3
- Task 8: 1
- **Total: ~38** (F6 was ~36; F7 sits in the same envelope)

---

## 10. Risks

- **R-1 LLM drift.** The LLM may return JSON that does not match the
  Zod schema. Mitigation: Zod is strict (rejects extra keys, wrong
  types, out-of-range enums). A failure returns 502 to the operator
  with a structured error; no Suggestion is persisted. The operator
  can Regenerate.
- **R-2 Cost.** Each suggestion costs ~1–3K tokens of LLM context plus
  completion. With a 10 req/min/IP rate limit and idempotency on
  pending, accidental cost is bounded; a deliberate flood is the
  operator's choice.
- **R-3 CWV shallow.** CWV suggestions are textual, not snippet-style
  diffs. The UI renders them as-is. This is a known limit of F7; the
  spec explicitly states CWV is advisory.
- **R-4 Global findings blocked.** Category-`overall` findings and any
  finding without `pageId` return 422. The operator sees a clear
  message. F8 can add a global-suggestions panel.
- **R-5 Rationale language drift.** The LLM is instructed to write
  rationale in `context.locale`. If it returns English when asked for
  pt-BR, the UI shows it as-is (no post-translation). F8 may add
  F6's `translateBatch` as a polish step.
- **R-6 Re-audit fan-out.** Accepting many suggestions in a short
  window enqueues many re-audits. Each re-audit is independent; the
  queue worker concurrency limit (F5.4) caps the simultaneous
  crawls. This is the existing behavior — F7 does not relax it.
- **R-7 Schema baseline (carryover from F6).** If the F6
  baseline-migration followup has not landed, the F7 migration has to
  use the hand-author pattern. This is a known working path
  (`migrate diff` → file → `migrate deploy`) and is documented in
  F6's progress.

---

## 11. Out of scope / future milestones (explicit)

- **F8 candidate 1: Global suggestions panel** for category-`overall`
  and other page-less findings. Reuses `runSuggestion` with a
  different context builder.
- **F8 candidate 2: Batch by page** ("suggest all 12 findings on
  /pricing") with progress UI. Reuses `POST /api/suggestions` in a
  loop; adds a `suggestion-batch` job type.
- **F8 candidate 3: Proactive auto-suggestion** after audit
  completion, behind an opt-in flag.
- **F8 candidate 4: Post-translation of rationale** via the F6
  `/api/translate` route, as a safety net.
- **F9 candidate: Closed-loop auto-correction** with budget
  (e.g. "up to 3 iterations per finding"). This is the big one; it
  is a separate brainstorming cycle, not a F7 follow-up.

---

## 12. Acceptance criteria

F7 is "done" when **all** of the following hold:

1. `Suggestion` exists in `prisma migrate status` and the schema is
   consistent with §5.1.
2. `packages/core/src/suggestions/` imports nothing from `apps/` and
   has no Prisma/BullMQ/Fastify references. `grep -RE
   "from ['\"]@?(\.\./)?apps" packages/core/src/suggestions` returns
   empty.
3. All 5 endpoints in §6.1 return the documented status codes on
   documented inputs. Idempotency in `pending` is exercised by a
   test that clicks "Gerar" twice within 5min and asserts one record.
4. Accepting a `pending` suggestion enqueues exactly one re-audit per
   page (delegating to F5.4's `POST /api/pages/:id/audit`). A second
   accept on a `superseded` suggestion does not enqueue. A second
   accept on an `accepted` suggestion returns 409. If F5.4 returns 409
   (in-progress), the response carries the existing `reAuditId`.
5. The `/app/fixes` SPA page loads, filters by project/audit/
   category/status, shows cards in all 4 status states, and the
   diff toggle works.
6. i18n parity test passes for all keys in §7.6.
7. `git diff main --stat` shows no parallel implementation of
   re-audit enqueue, LLM provider, or rate limit.
8. The `f3-smoke` smoke test adds at least 1 new passing case
   (DB-gated) that exercises the full create-accept-enqueue flow.
9. `pnpm run typecheck` is exit 0 in all 3 workspaces. `pnpm test`
   is exit 0 with at least as many passing tests as F6 (apps/api
   ≥ 38, packages/core ≥ 104, apps/web ≥ 2).
10. The whole-branch reviewer finds 0 Critical and 0 Important. Any
    Minor issues are recorded in the carryover ledger.

---

## 13. Definition of Done

- [ ] All 12 acceptance criteria pass.
- [ ] 1 whole-branch review done; 0 Critical, 0 Important.
- [ ] Plan + Spec + Progress files updated under `docs/superpowers/`.
- [ ] README has F7 bring-up notes.
- [ ] All commits signed off by reviewer in `progress.md`.
