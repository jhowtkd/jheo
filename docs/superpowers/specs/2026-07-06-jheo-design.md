# JHEO — Design

**Status:** approved
**Date:** 2026-07-06
**Author:** brainstorming session

## 1. Purpose

JHEO is a Docker-shipped web app that audits existing websites (SEO + performance + GEO / AI-readiness + accessibility + content), generates GEO-optimized content informed by those audits, and distributes approved drafts to multiple destinations (WordPress, generic HTTP, GEOFlow Agent bundles). It is the user's local, single-user tool that blends — but does not fork — the strengths of OpenSEO (audits, MCP integration) and GEOFlow (GEO content + multi-site distribution).

This design covers the **MVP** scope: a full stack runnable with `docker compose up`, with audit + generation + distribution working end-to-end against one project at a time.

## 2. Non-goals

- Multi-tenant SaaS, team accounts, or any form of multi-user auth.
- Replacing OpenSEO's keyword research / rank tracking / backlink analysis (those are intentionally out of scope; JHEO does site audits and content, not keyword SERP harvesting).
- Forking GEOFlow. JHEO ships its own generation + distribution pipeline; GEOFlow is a *reference*, not a dependency.
- Hardcoded AI providers. Only BYOK adapters in MVP.
- Kubernetes / cloud-specific deployment configurations.

## 3. Architecture

### 3.1 Topology

A single TypeScript pnpm monorepo with three packages, deployed via `docker compose`. The user accesses the SPA at `http://localhost:5173` (dev) or `http://localhost:8080/app` (compose), talks to a Fastify HTTP API at `/api`, and a BullMQ worker running in the **same process** as the API. Postgres 16 with pgvector stores all persistent state. No auth layer — single-user local use, bound to `127.0.0.1`. **Container-side binds**: api server binds to `0.0.0.0:8080` inside docker (required for port-mapping). Host-side port mapping (`127.0.0.1:8080 → container`) preserves loopback-only exposure on the host.

```
┌─────────────────────────────────────────────────────────────┐
│  browser → apps/web (Vite SPA)                              │
│            ↕ HTTP /api                                      │
│  apps/api (Fastify + BullMQ worker, same process)           │
│     ├─ handlers → thin orchestration                        │
│     └─ worker → BullMQ → packages/core pipelines            │
│                              ↕ SQL                           │
│                       Postgres 16 (+ pgvector)               │
└─────────────────────────────────────────────────────────────┘
```

The single-process API+worker is a deliberate trade-off: it keeps Docker compose at three services (api, web, postgres) and is appropriate for single-user load. Horizontal scaling is not an MVP concern.

### 3.2 Repository layout

```
jheo/
├── apps/
│   ├── web/                 # Vite + React SPA
│   └── api/                 # Fastify server + BullMQ worker (same process)
├── packages/
│   └── core/                # Pure logic, no infra deps
│       ├── src/audit/       # audit plugins + orchestrator
│       ├── src/generation/  # RAG, prompt assembly, generation pipeline
│       ├── src/distribution/# publisher adapters
│       ├── src/llm/         # LLM provider adapters (BYOK)
│       └── src/jobs/        # BullMQ job definitions + handlers (wire-up only)
├── docker/
│   ├── docker-compose.yml
│   └── Dockerfile.api
├── docs/superpowers/specs/
├── pnpm-workspace.yaml
└── package.json
```

### 3.3 Boundary rules

- **`packages/core` is pure.** It cannot import from Fastify, BullMQ, Prisma, or anything that dials out to a real service. HTTP fetches, database access, and LLM calls all arrive via an injected `AuditContext` (or analogous contexts for generation/distribution). This keeps every check, prompt, and publisher unit-testable without infra.
- **`apps/api` is thin.** It wires HTTP routes to core pipelines and BullMQ jobs. No business logic lives here.
- **No silent coupling across categories.** Each audit plugin is a function `(ctx) => Finding[]`. They run in parallel, write to the same `Findings` table, and never call each other.

### 3.4 Why a monolith, not microservices

The user explicitly chose a single deployable app. Boundaries between subdomains are enforced by package structure (`core/audit`, `core/generation`, `core/distribution`) and by the pure-TS rule for `core`. If a sub-domain later needs to scale independently, it can be extracted into its own package + container without rewriting `core`.

## 4. Data model

All tables are created via Prisma migrations. JSONB columns hold structured payloads whose schemas are defined in `packages/core` and imported by the API layer.

### 4.1 Entities

| Table | Purpose | Key fields |
|---|---|---|
| `Project` | A site the user is working on | `id, name, rootUrl, createdAt` |
| `AuditConfig` | Per-project default audit parameters | `id, projectId, categories[], crawlDepth, userAgent` |
| `Audit` | One execution of auditing a project | `id, projectId, status, startedAt, finishedAt, configSnapshot jsonb, score jsonb?` |
| `Finding` | One issue surfaced by an audit | `id, auditId, category, severity, rule, message, evidence jsonb, url, selector?` |
| `Material` | Reusable source content for RAG | `id, projectId, type(url\|file\|note), content, embedding vector(1536)?, metadata jsonb` |
| `GenerationTemplate` | Editable prompt templates | `id, name, version, prompt, outputSchema jsonb` |
| `Generation` | One generation run | `id, projectId, prompt, templateId?, status, outputMarkdown, sources jsonb, llmConfig jsonb, reviewState(draft\|in_review\|approved), createdAt` |
| `DistributionChannel` | A destination configured per project | `id, projectId, type(wordpress\|http\|agent), configEncrypted text` |
| `Publish` | A single publish attempt | `id, generationId, channelId, status, response jsonb, attempt, attemptedAt` |

### 4.2 Encryption at rest

`DistributionChannel.configEncrypted` stores channel credentials encrypted with an AES-256-GCM key from `JHEO_SECRET_KEY` env var. If the env var is missing at startup, the API logs a warning and disables any publisher that requires credentials — the channel row is still queryable but cannot be used until the key is set.

### 4.3 Score

`Audit.score` is `jsonb` shaped `{ seo: number, cwv: number, geo: number, a11y: number, content: number, overall: number }`. Each category score is a normalized 0–100 derived from severity-weighted findings. Categories with no findings (e.g. CWV failed to run) are stored as `null`, not 0, and the UI labels them "indeterminate" rather than penalising.

## 5. Flows

### 5.1 Audit

1. User triggers `Run audit` from the project page.
2. POST `/api/projects/:id/audits` → API inserts an `Audit (status=queued)`, snapshots the project's `AuditConfig`, and enqueues a BullMQ job in the `audit` queue.
3. Worker picks the job, transitions the row to `running`, sets `startedAt`.
4. Worker constructs an `AuditContext` (containing HTTP fetcher, Puppeteer page factory, logger, DB handle) and runs all enabled audit plugins in parallel.
5. Each plugin persists `Finding` rows directly as it discovers them. The orchestrator aggregates counts and computes `score` once all plugins settle.
6. Status transitions to `completed` (or `failed` if any critical plugin threw — non-critical plugin failures are logged and skipped).
7. UI polls `/api/audits/:id` (or subscribes via a simple `EventSource` later) and renders the dashboard.

Concurrency: the `audit` queue allows 2 concurrent jobs. Crawl depth and request concurrency are bounded by config, never unbounded.

### 5.2 Generation

1. User authors a prompt in the UI, optionally picks N materials from the project library.
2. POST `/api/projects/:id/generations` → `Generation (status=queued, reviewState=draft)` inserted; job enqueued in `generate` queue.
3. Worker runs `core/generation` pipeline: load materials, embed the query, top-K retrieval from pgvector, assemble prompt from template, call the LLM adapter, parse + validate Markdown + frontmatter against Zod schema. On schema validation failure the LLM is retried once with corrective instruction. Persistent failure marks the row `failed` with the validator's message.
4. UI shows the diff with each claim linked to the source material it came from. Review state machine: `draft → in_review → approved` (or back to `draft` with notes).
5. Nothing leaves the app until `approved` is set explicitly.

Concurrency: `generate` queue at 3 concurrent jobs. Embedding calls are batched (50 per request).

### 5.3 Distribution

1. From an approved `Generation`, user selects one or more `DistributionChannel`s and clicks `Publish`.
2. POST `/api/generations/:id/publish` with `{ channelIds: [...] }` → inserts a `Publish` per channel with `attempt=0`, status=`queued`, and enqueues one `publish` job per channel in the `publish` queue.
3. Worker decrypts channel config at the moment of execution, picks the right `Publisher` adapter, invokes `publish(content, config)`, captures `{ externalId, url }` from the response.
4. On failure, the job retries with exponential backoff (30s, 2m, 10m), tracked via `Publish.attempt`. Final failure marks the row `failed` with full error.
5. User can cancel pending jobs via the BullMQ API. In-flight jobs respect an `AbortController` that the adapter polls before each network call.

Concurrency: `publish` queue at 5 concurrent jobs.

## 6. Audit plugins

All plugins live in `packages/core/src/audit/<category>/`. Each export is `async function check(ctx: AuditContext): Promise<Finding[]>`. The orchestrator runs them in parallel and writes a row per finding.

### 6.1 SEO technical (`seo/`)

- `meta.check`: `<title>` length, presence, uniqueness; `meta name=description` length; canonical link; `meta robots`; viewport; charset.
- `headings.check`: exactly one `<h1>` per page; no level-skipping (`h1 → h3`); heading length sanity.
- `sitemap.check`: parse `/sitemap.xml`; ensure root URL present; respect `robots.txt` disallows.
- `robots-txt.check`: parse `/robots.txt`; verify no `Disallow: /`; verify `Sitemap:` directive when a sitemap exists.
- `links.check`: count internal vs external; flag `nofollow`/sponsored/UGC proportions; HEAD-probe a sample (≤50) to flag broken links.
- `images.check`: missing `alt`; missing `width`/`height`; missing `loading="lazy"` on off-screen candidates (heuristic).
- `open-graph.check`: minimum set of OG tags present; Twitter card summary.
- `json-ld.check`: extract `<script type="application/ld+json">` blocks; structural validation of `Organization`, `Article`, `BreadcrumbList`, `FAQPage`, `Product` schemas using locally defined validators (no external API).

### 6.2 Performance / CWV (`cwv/`)

- `lighthouse.check`: headless run via Puppeteer + `lighthouse` programmatic API. Captures LCP, CLS, TBT, FCP, Speed Index.
- `requests.check`: total requests; render-blocking; duplicates by URL; non-200 statuses.
- `hints.check`: presence of `preconnect`, `preload`, `dns-prefetch` for cross-origin assets identified by Lighthouse.
- `cache.check`: sample assets (≤30 per page); verify `Cache-Control` with `max-age>0` on static assets.
- `compression.check`: HTML / CSS / JS responses serve `Content-Encoding: gzip|br|zstd`.

### 6.3 GEO / AI-readiness (`geo/`)

- `llms-txt.check`: GET `/llms.txt`; ensure it is well-formed markdown with H1 and at least one named page entry.
- `ai-crawler-access.check`: parse `/robots.txt` and detect whether user-agent groups allow `GPTBot`, `ClaudeBot`, `Claude-Web`, `PerplexityBot`, `Google-Extended`, `Applebot-Extended`. Result per crawler is `allowed | blocked | not-mentioned` (the latter is informational, not an error).
- `citability.check`: presence of `<blockquote>` with attribution; ordered/numbered lists; `<table>` with `<th>`; ISO-8601 dates; visible author name in `<article>` or schema.
- `markdown-parallel.check`: applied only to pages the crawler identifies as content-bearing (≥300 words of visible text). Sends a second GET with `Accept: text/markdown`; if a markdown version exists, verify it carries the main headline from the HTML render.
- `faq-structure.check`: pairs of question/answer with matching `FAQPage` schema.
- `schema-coverage.check`: rough percentage of unique content blocks in the page that have backing schema.

### 6.4 Accessibility (`a11y/`)

- `axe-core.check`: run `@axe-core/puppeteer` against each page and map violations to WCAG 2.1 AA findings.
- `contrast.check`: sample computed-style pairs from the rendered DOM (text vs background), warning when contrast ratio < 4.5:1 (3:1 for large text).
- `lang-attr.check`: `<html lang>` present and non-empty.
- `skip-links.check`: presence of a "skip to main" link as first focusable element.

### 6.5 Content (`content/`)

- `lang-consistency.check`: declared lang vs. simple stop-word heuristic for pt/en/es. Mismatch is a warning, not an error.
- `readability.check`: Flesch Reading Ease (pt and en variants). Surfaces values; only warnings above project threshold.
- `thin-content.check`: pages in the project's "key page list" with fewer than 300 words are flagged.
- `dates.check`: pages of type article have either `datePublished` schema or visible ISO date.

### 6.6 Output UI

- Project dashboard: category cards with score and finding count.
- Findings list: filterable by category, severity, URL. Click → side panel showing evidence and selector.
- Diff view between two audits of the same project: regressions and improvements, with color-coded diffs in the score.
- Export findings as JSON and as Markdown report (a single bundled `.md`).

## 7. Generation

### 7.1 Pipeline

`packages/core/src/generation/pipeline.ts` runs in this order:

1. Load materials (if any were selected) and the prompt.
2. Embed the query (and selected-material bodies not yet embedded).
3. Top-K retrieval: cosine similarity against the project's material embeddings, threshold configured per project (default 0.78).
4. Build the prompt from `GenerationTemplate`: persona + goal + audience + selected source excerpts + the user's prompt + the output schema description.
5. Call the LLM adapter with the prompt.
6. Parse the response: split frontmatter (YAML) and body (Markdown GFM). Validate against Zod schema defined in `core/generation/schema.ts`. Required frontmatter: `title, slug, description, tags[], date, sources[], targetSites[]`.
7. Persist the `Generation` row in `approved=false`, `reviewState=draft`.

### 7.2 LLM adapters (`packages/core/src/llm/`)

`LLMProvider` interface:

```ts
interface LLMProvider {
  complete(req: {
    prompt: string;
    schema?: ZodSchema<any>;
    config: { model: string; temperature?: number; maxTokens?: number };
    signal?: AbortSignal;
  }): Promise<{ text: string; usage: { promptTokens: number; completionTokens: number } }>;
}
```

Adapters shipped in MVP:
- `OpenAIProvider` (works against any OpenAI-compatible endpoint)
- `AnthropicProvider` (Anthropic Messages API)
- `OpenRouterProvider` (single-base-URL passthrough)

Users pick a provider and enter the API key in Settings (stored encrypted via the same `JHEO_SECRET_KEY` envelope as channels). Schema-validated outputs use a one-shot retry on parse failure with a corrective suffix.

### 7.3 Templates

`GenerationTemplate` rows are versioned: editing a template creates a new version row and never mutates an old one. Renders are pinned to the version in use at job dispatch time, so audits of past output remain reproducible.

### 7.4 Review

UI exposes the diff side-by-side, with each claim linkable to a source material. Buttons: `Send to review` (transitions to `in_review`), `Approve` (transitions to `approved`), `Reject with notes` (returns to `draft`).

## 8. Distribution

`packages/core/src/distribution/` exports a `Publisher` interface:

```ts
interface Publisher {
  type: 'wordpress' | 'http' | 'agent';
  publish(req: {
    content: ParsedMarkdown; // { frontmatter, body, sources }
    config: unknown;         // adapter-specific; decrypted by api worker before call
    signal?: AbortSignal;
  }): Promise<{ externalId?: string; url?: string }>;
}
```

### 8.1 WordPress

REST API at `/wp-json/wp/v2/posts`. Auth via Application Password (Basic auth). Mapping uses frontmatter → post fields (`title`, `excerpt`, `slug`, `categories` and `tags` resolved via name-match against existing WP terms). The `status` field is configurable per channel and defaults to `draft`; setting it to `publish` requires explicit user opt-in in the channel form. On 2xx response the inserted post's `id` and `link` are recorded.

### 8.2 HTTP generic

User configures: method (always POST in MVP), URL, headers, optional Handlebars template applied to the body, auth scheme (none / Basic / Bearer). Success criterion: 2xx. Optional JSONPath expressions extract `externalId` and `url` from the response.

### 8.3 GEOFlow Agent

The publisher produces a ready-to-deploy bundle in a user-chosen output directory:

```
<outputDir>/
├── home.html
├── article.html            # uses frontmatter + body to render a semantic page
├── llms.txt
├── robots.txt
├── sitemap.xml
└── assets/                 # placeholder; populated if the source includes images
```

Bundling is performed by a `static-render` sub-module that does not need the GEOFlow PHP runtime. The UI shows a `Download zip` button and prints drop-in instructions to copy the bundle over an existing PHP site. This honours "GEOFlow Agent" as a delivery format without introducing a PHP sidecar.

### 8.4 Retries & cancellation

Each `Publish` gets `attempt` increments on failure up to `attempts=3` (configurable per channel) with backoff 30s/2m/10m. The worker passes an `AbortSignal` to the publisher; the UI exposes `Cancel` for queued jobs, and a per-job cancel button that aborts in-flight adapters between network calls.

## 9. Frontend

- React 18 + TypeScript + Vite. React Router for views. State via TanStack Query for server data + Zustand for local UI state.
- Views: project list, project dashboard (audit + generation summary), audit runner + results, generation composer + review, distribution manager, settings (LLM keys, project config).
- Polling: audits and generations are polled every 2s while in `running` state, using `AbortController` cleanup.

## 10. Configuration & environment

Single root `.env` (copied from `.env.example` on bootstrap). Keys:

```
JHEO_SECRET_KEY=         # 32-byte base64; required to decrypt channel configs & LLM keys
DATABASE_URL=            # postgres://jheo:jheo@postgres:5432/jheo
WEB_PORT=8080
LOG_LEVEL=info
```

`docker compose up` generates a random `JHEO_SECRET_KEY` automatically if absent, writes it to a persistent `.env.local` (mounted into the api container), and warns loudly on every subsequent start that this file must not be deleted. The README documents manual rotation: stop containers, generate a new key, re-enter channel and LLM credentials — there is no in-place key rotation; existing encrypted rows become unreadable and are flagged on next read.

`docker-compose.yml` populates `DATABASE_URL`, `WEB_PORT`, and `LOG_LEVEL`; everything else comes from `.env.local`.

## 11. Testing strategy

- **Unit (`packages/core`):** Vitest. Every audit plugin has an HTML fixture + expected-finding snapshot. Every LLM adapter has a mocked `fetch` test. Every publisher has a mocked-server test.
- **Integration (`apps/api`):** Vitest + a per-test Postgres throwaway database via `docker-compose.test.yml`. Routes are exercised against the real API with a fake worker pool.
- **Component (`apps/web`):** Vitest + Testing Library for the project dashboard, audit runner, generation composer, and review pane.
- **End-to-end (`e2e/`):** Playwright. Three smoke tests:
  1. `docker compose up` brings all services healthy.
  2. Create a project, run an audit against a fixture site served by Playwright's static server, verify the dashboard renders ≥1 finding.
  3. Create a generation, approve it, publish to a fake HTTP channel, verify the `Publish` row is `succeeded`.

No target coverage number is enforced, but every category in §6 must have at least one golden-file test before it is marked ready.

## 12. Out-of-scope questions deferred

- Multi-user auth, accounts, billing.
- Hooking into Google Search Console / DataForSEO (the OpenSEO-style sources).
- MCP server exposure (would mirror OpenSEO's `mcp` package — feasible later, not in MVP).
- Streaming LLM outputs to UI over SSE.
- Replacing Puppeteer with a lighter crawler (Puppeteer is the right tool for CWV + axe).

## 13. Open assumptions explicitly called out

- **Single-user, trust-the-host.** No auth = no security boundary. The README will say so. If the user exposes the container port, that's on them.
- **Local LLM cost is not optimized.** BYOK means users pay their provider. We don't add caching, batching across requests, or rate-limit dance — that is the provider's job.
- **GEO is an evolving target.** The "ai-crawler-access" and "llms.txt" checks reflect 2026-07's consensus; the file `packages/core/src/audit/geo/ai-crawlers.ts` lists known agents and is meant to be edited as the landscape changes.
- **Content language heuristics are English- and Portuguese-first.** Other languages get warnings, not errors.
