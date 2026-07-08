# F6 — i18n (pt-BR/en) + Acessibilidade de Linguagem

**Date:** 2026-07-08
**Status:** Draft
**Milestone:** F6
**Author:** jhowtkd
**Predecessor:** F1–F3 (shipped), F-Hardening (shipped), F5 (active)

---

## 1. Problem

JHEO today is a single-language (English) single-user local tool. The
frontend (`apps/web`) ships every string hard-coded in English: the sidebar
labels (`Projects`, `Templates`, `Settings` — see `Layout.tsx:22-56`), all
pages, all buttons, all error messages, all help text. The backend (Fastify)
also has no locale awareness; every response is English-only.

In practice, the tool will be used by a Portuguese-speaking technical
professional who, in turn, delivers the **outputs** (audit findings, generated
content) to a non-technical client whose primary language is pt-BR and whose
formal education may be limited. Three concrete gaps follow:

1. **Chrome of the UI is English-only.** A non-technical stakeholder who
   looks over the operator's shoulder sees jargon with no explanation.
2. **Backend returns English-only enum labels and free-text messages.**
   `category: "seo"`, `severity: "warning"`, `status: "cancelled"`,
   `Finding.message`, `Generation.outputMarkdown` are all English; the operator
   has no way to show a pt-BR stakeholder a report that is readable for them.
3. **No plain-language tone.** Even when text exists in pt-BR, it is likely
   to be a literal translation of enterprise copy ("execute uma auditoria
   multifacetada do seu domínio"), which is exactly the wrong register for a
   person with limited formal education.

F6 ships a deliberately small i18n layer that fixes all three.

## 2. Goals

- The UI chrome (sidebar, topbar, page titles, buttons, error messages,
  tooltips) is available in **en** and **pt-BR** with a manual toggle in the
  topbar; the choice persists across reloads.
- The locale of the UI is propagated to the backend via `Accept-Language`,
  so future server-side code can be locale-aware without further plumbing.
- Audit findings (and other long-form English content surfaced by the
  backend) are translated to the operator's UI locale on demand via the LLM
  already wired into F2, with a persistent cache keyed by `(text, locale,
  context)`. Translation failures fall back to the original English text
  with a discreet indicator.
- Generated content (F2) is produced in the operator's UI locale by default,
  with a per-generation override (`targetLocale`) for advanced use.
- All pt-BR copy is written in **plain language** — short sentences, everyday
  vocabulary, no marketing jargon — and inline `?` help tips explain
  domain terms (`audit`, `finding`, `CWV`, `GEO`).
- Adding a third locale later is a translation PR and a one-line registration.

## 3. Non-Goals

- Any auth, multi-tenant, or per-user language preference (single-user local
  tool; per-browser is sufficient).
- Translating 100% of the LLM's free-form output deterministically (we translate
  on demand; the LLM can still drift, but the cache softens the cost).
- Translating **user-authored content** (materials the user uploads as PDFs,
  notes typed in en, etc.) — that is the user's data, not chrome.
- Mobile-specific UX (the primary operator works on desktop; pt-BR
  stakeholders consume the **exported** output, not the SPA).
- Locale-aware date/number formatting in the SPA — out of scope for v1; we
  use ISO timestamps in the API and format with the browser default.
- Replacing F2 LLM provider for translations — F6 reuses whatever provider
  the user has configured for generation.
- Right-to-left languages, plural rules beyond `Intl.PluralRules` defaults,
  and any locale-specific input methods.

## 4. Architecture

### 4.1 Component overview

```
┌─────────────────────────────────────────────────────────────┐
│ apps/web (React + i18next + react-i18next)                  │
│ ┌─────────────────────┐  ┌──────────────────────────────┐   │
│ │ chrome of the UI    │  │ data from backend            │   │
│ │ i18next + JSON      │  │ (findings, generations,      │   │
│ │ catalogs (en,       │  │  materials)                  │   │
│ │  pt-BR)             │  │                              │   │
│ └─────────────────────┘  └──────────────────────────────┘   │
│           │                            │                    │
│           │ t('key')                   │ useTranslation()   │
│           │ localStorage               │ (calls             │
│           │                            │  /api/translate)   │
└───────────┼────────────────────────────┼────────────────────┘
            │                            │
            ▼                            ▼
┌─────────────────────────────────────────────────────────────┐
│ apps/api (Fastify)                                          │
│ ┌─────────────────────┐  ┌──────────────────────────────┐   │
│ │ i18n hook           │  │ POST /api/translate          │   │
│ │ Accept-Language →   │  │ cache: TranslationCache      │   │
│ │ req.locale          │  │ miss → LLM (F2 provider)     │   │
│ │ (en, pt-BR)         │  │ in batch w/ plain-language   │   │
│ └─────────────────────┘  │ system prompt                │   │
│                         └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Locale negotiation

**Per-browser**, persisted in `localStorage` under key `jheo.locale`.

Resolution order on app boot:

1. `localStorage['jheo.locale']` — if present and ∈ {`en`, `pt-BR`}, use it.
2. `navigator.language` — normalize; `pt*` → `pt-BR`; `en*` → `en`;
   anything else → `en` (default).
3. Default: `en` (the primary operator is a technical English-speaking
   professional; we do not bias the first-run experience).

The toggle in the topbar updates `localStorage` immediately and re-renders
without a page reload.

### 4.3 Backend locale awareness

A Fastify `onRequest` hook reads `Accept-Language` and attaches
`req.locale: 'en' | 'pt-BR'` to the request. Type augmentation:

```ts
declare module 'fastify' {
  interface FastifyRequest {
    locale: 'en' | 'pt-BR';
  }
}
```

Backend **does not** translate chrome-like labels in responses. The contract
is: backend returns the canonical `code` (`seo`, `warning`, `cancelled`,
`NEW`, `IMPROVEMENT`); the client resolves it through i18n. This avoids
bloating payloads with parallel `*Label` fields and keeps the backend pure
and locale-agnostic.

The one exception is `Content-Language` on responses — the API echoes
`req.locale` so caches and clients can inspect it.

### 4.4 Translation under demand — `POST /api/translate`

```http
POST /api/translate
Content-Type: application/json
Accept-Language: pt-BR

{
  "texts": ["Meta description is missing.", "Image alt is empty."],
  "context": "finding",
  "targetLocale": "pt-BR"
}

200 OK
{
  "translations": [
    { "original": "Meta description is missing.", "translated": "Falta a descrição da página.", "cached": true },
    { "original": "Image alt is empty.",         "translated": "A imagem não tem texto alternativo.", "cached": false }
  ]
}
```

**Pipeline:**

1. Validate `texts` is a non-empty array (max 50 entries; beyond that the
   client should chunk — enforced to bound LLM call size).
2. Validate `targetLocale` ∈ {`en`, `pt-BR`}. If `targetLocale === 'en'`,
   short-circuit and return each `text` as its own translation
   (`cached: true`).
3. For each text, compute `cacheKey = sha256(text + targetLocale + context)`.
4. Look up all keys in `TranslationCache` in a single query.
5. For misses, batch into a single LLM call with a system prompt that
   encodes the plain-language register.
6. Persist each new translation; return all entries with `cached: boolean`.
7. If no LLM provider is configured (no `OPENAI_API_KEY` env and no
   `Setting` row), return `503` with `error: "no_llm_provider"`; the
   client falls back to the original text.

**System prompt (delta to `apps/api/src/generation/prompt.ts`):**

```
You are a translator from English to {{targetLocaleName}}. You translate
content from a website-auditing tool. Render each line in plain language:
short sentences, everyday words, no marketing jargon, no enterprise
vocabulary, no "execute" / "leverage" / "utilize". The translated text
will be read by people with limited formal education, so clarity matters
more than cleverness. Preserve technical terms that are jargon in the
auditor's market (e.g. SEO, CWV, GEO, audit, finding) when they are
shorter and more recognizable than any translation. Return ONLY the
translations, one per line, in the same order as the input.
```

**Rate limit:** in-memory token bucket per IP, 10 req/min (UI batches, so
this is defensive only).

### 4.4.1 Client call sites

The `useDataTranslations()` hook in `apps/web/src/i18n/useDataTranslations.ts`
watches the active UI locale and the locale of the data on screen. For
each row of long-form data (`Finding.message`, `Generation.outputMarkdown`,
and optionally `Material.title`), it collects the untranslated strings,
batches them, and calls `POST /api/translate` once. Results live in a
per-page in-memory map so navigation between pages does not re-fetch.
The first render after a locale switch will hit the network; subsequent
renders are instant. If `uiLocale === 'en'`, the hook short-circuits and
no network call is made.

When the API returns 503 (`no_llm_provider`) or 429, the original English
text is shown with a discreet inline indicator (`↻ translation unavailable`)
so the operator can recover by configuring a provider in Settings.

### 4.5 Generation locale

When a `Generation` is created, `generation.locale` is set to
`req.locale`. The LLM is instructed to write in that locale (system
prompt already in F2 gains a `{{locale}}` and `{{localeName}}` slot, plus
the plain-language clause from §4.4).

An optional body field `targetLocale` overrides this for advanced use
(professional wants UI in en, but the article should come out in pt-BR).
When `targetLocale !== req.locale`, the response field `translatedTo`
records the override and the operator sees a small badge.

### 4.6 Chrome catalog (apps/web/src/i18n)

```
apps/web/src/i18n/
  index.ts          # init i18next; useLocale(); setLocale()
  en.json           # canonical
  pt-BR.json        # every key present; same shape
  HelpTip.tsx       # <HelpTip term="audit" /> popover
```

**Namespaces** (single file, no lazy split in v1 — total size ~15 KB per
locale, gzipped):

| Key prefix        | Contents                                              |
|-------------------|-------------------------------------------------------|
| `app.*`           | `name`, `tagline`                                     |
| `nav.*`           | sidebar entries                                       |
| `topbar.*`        | breadcrumb, health, language toggle                   |
| `languages.*`     | label for each locale                                 |
| `projects.*`      | ProjectsList, ProjectDashboard chrome                 |
| `audit.*`         | AuditRunner, AuditResults chrome + category/severity/status enums |
| `findings.*`      | FindingList chrome + diff labels + severity tints     |
| `generation.*`    | GenerationComposer, GenerationReview, TemplatesList   |
| `publish.*`       | ChannelsList, PublishDetail chrome + status enums     |
| `settings.*`      | Settings page chrome + provider labels                |
| `help.*`          | inline help popovers (`audit`, `finding`, `cwv`, `geo`, `seo`) |
| `errors.*`        | common error messages                                 |

**Plain-language rules for pt-BR:**

- Voice active, second person ("clique aqui", not "deve-se clicar").
- Maximum ~14 words per sentence.
- Avoid: *execute*, *realize*, *efetue*, *otimize*, *leverage*,
  *solução completa*, *fluxo de trabalho*.
- Keep English jargon when it's shorter and market-recognized: SEO, CWV,
  GEO, audit, finding, score, plugin.
- Inline `?` `<HelpTip>` next to every domain term on first appearance
  in a page.

**Build-time validation:** a Vitest unit test enumerates the keys of
`en.json` and asserts each one is present in `pt-BR.json`. The build
breaks on a missing key.

### 4.7 HelpTip component

```tsx
<HelpTip term="audit" />  // reads help.audit from i18n
```

- Renders a focusable button with a small `?` glyph.
- On click or focus + Enter, opens a popover with the localized help text.
- Closes on Esc, click outside, or blur.
- Keyboard accessible (tab order, ARIA `aria-describedby`).

Initial terms covered: `audit`, `finding`, `cwv`, `geo`, `seo`, `score`,
`plugin`, `crawl`, `sitemap`, `generation`, `publish`.

## 5. Domain Model

### 5.1 Schema changes

```prisma
// apps/api/prisma/schema.prisma — new model

model TranslationCache {
  id           String   @id @default(cuid())
  cacheKey     String   @unique
  text         String
  targetLocale String   // 'en' | 'pt-BR'
  context      String   // 'finding' | 'generation' | 'material' | 'help'
  translated   String
  provider     String   // 'openai' | 'anthropic' | 'openrouter'
  model        String
  createdAt    DateTime @default(now())

  @@index([targetLocale, context])
}

// apps/api/prisma/schema.prisma — delta to Generation

model Generation {
  // ...existing fields
  locale       String  @default("en")
  translatedTo String?
}
```

### 5.2 Migration

`prisma migrate dev` produces one migration:

- `CREATE TABLE "TranslationCache" (...)`
- `ALTER TABLE "Generation" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en'`
- `ALTER TABLE "Generation" ADD COLUMN "translatedTo" TEXT`

No backfill needed: `Generation.locale` defaults to `en`, which is correct
for all pre-F6 generations (the LLM was en-only).

## 6. API Surface

| Method | Path                 | Purpose                                     | Status |
|--------|----------------------|---------------------------------------------|--------|
| POST   | `/api/translate`     | Batch-translate strings via LLM, cached     | new    |
| (every existing route) | — | Adds `Accept-Language` → `req.locale`; echoes `Content-Language` | delta |
| (every existing response) | — | No change to body shape; client resolves labels | none |

`POST /api/translate` request/response spec is in §4.4.

## 7. Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| i18next + react-i18next for chrome | Industry standard; small bundle; per-key lazy access; trivial locale switching | — Pending |
| Translation cache in DB (not Redis) | JHEO is single-user; cache warms once and persists; avoids Redis schema sprawl | — Pending |
| Backend returns canonical codes, client resolves labels | Avoids payload bloat; keeps backend pure; one place to add a label | — Pending |
| Plain-language prompt in pt-BR only | Operator is technical and reads en fine; pt-BR stakeholder is the audience that needs clarity | — Pending |
| Generation.locale defaults to req.locale; targetLocale is an override | Honors "UI and generation always equal" decision; escape hatch exists | — Pending |
| Rate limit at 10 req/min | UI batches; defensive only | — Pending |
| LLM translation on miss only; en stays en | Zero-cost for en-primary operator; opt-in cost for others | — Pending |
| `Content-Language` echo only; no label translation in API | Lets clients/CDNs inspect locale without per-route logic | — Pending |

## 8. Testing

### apps/web

- Unit: `negotiateLocale` (covers `en`, `en-US`, `pt`, `pt-BR`, `fr`,
  missing, malformed); `t()` with fallback to `en`; locale persistence in
  `localStorage`.
- Component: `<LanguageToggle />` toggles locale and persists;
  `<HelpTip />` is keyboard accessible (Tab, Enter, Esc).
- Integration: with `vi.mock`, `<ProjectsList />` renders all chrome in
  pt-BR when `i18n.locale = 'pt-BR'`; falling back to en on missing key
  emits a console warning in dev (silent in prod).

### apps/api

- Unit: `negotiateLocale` (same coverage as web).
- Route smoke: `GET /api/audits/:id` returns `Content-Language: en` when
  `Accept-Language: pt-BR` is sent.
- `POST /api/translate`:
  - 200 with all entries cached.
  - 200 with mixed cache + LLM miss (mock provider).
  - 200 with 100% miss; LLM called once with batch prompt.
  - 200 with `targetLocale: 'en'` short-circuits (no LLM call).
  - 503 when no LLM provider is configured.
  - 429 on the 11th req in <1 min.
  - 400 on `texts.length > 50` or empty `texts`.
- Schema shape: `TranslationCache.cacheKey` unique; `Generation.locale`
  defaults to `en`; migration is non-destructive.

## 9. Rollout

- **Chrome (i18next):** in-place. The first user reloads and sees English
  UI (current state). Toggling to pt-BR requires no migration, no flag, no
  server round-trip.
- **Backend `req.locale`:** in-place. No behavior change unless a route
  reads it (F6 only uses it for `POST /api/translate` and `Generation.locale`).
- **`POST /api/translate`:** opt-in. Only called by client components that
  decide the data text and the UI locale differ. Zero cost when the operator
  is en-only.
- **`Generation.locale`:** in-place. New generations get the locale; old
  generations keep `en` (correct).
- **No feature flag.** The risk surface is small and reversible: a missing
  pt-BR key falls back to en, a failing LLM call returns the original text.

## 10. Open Questions

- None at design time. All open points are deferred to the implementation
  plan (e.g. exact key naming in the JSON catalog, exact color of the
  "translation unavailable" indicator).

## 11. Traceability

| Requirement (from brainstorm) | Section |
|-------------------------------|---------|
| Manual locale switch with persistence | §4.2 |
| Translate everything visible (chrome + data) | §4.3, §4.4, §4.6 |
| On-demand LLM translation for data | §4.4 |
| Plain-language tone in pt-BR | §4.4 prompt, §4.6 rules |
| Inline `?` help for domain terms | §4.7 |
| Generation locale follows UI locale | §4.5 |
| Catalog versioned in repo | §4.6 |
| New locale = translation PR + one-line registration | §4.6 (build test enforces parity) |

---

*Spec drafted: 2026-07-08*
