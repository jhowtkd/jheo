# JHEO F2 — Generation GEO Design

**Status:** approved
**Date:** 2026-07-06
**Author:** brainstorming refinement of F1 spec §7
**Depends on:** `2026-07-06-jheo-design.md` (F1, shipped)

## 1. Purpose

F2 enables JHEO to **generate GEO-optimized content** from project materials, review it, and approve drafts for future distribution (F3). It does not yet publish anything — that is F3. The deliverable is a working pipeline: ingest materials → embed → retrieve top-K → assemble prompt with template → call LLM (BYOK) → parse + validate → persist draft → review → approve.

This design covers the MVP scope: pgvector + RAG, three LLM adapters (OpenAI / Anthropic / OpenRouter), OpenAI embeddings (1536d, text-embedding-3-small), versioned GenerationTemplate rows, materials CRUD across URL/file/note, review state machine (draft → in_review → approved), and a SPA composer/review UI.

## 2. Non-goals

- Multi-tenant or shared material libraries (materials are scoped per Project, period).
- Real cost tracking — `usage` is captured per generation but we don't show $ aggregates (out of MVP).
- Streaming LLM responses to UI (worker writes the result when complete; UI polls).
- Fine-tune or eval pipelines for templates.
- Distribution to external sites (F3).
- Auth or per-user settings (single-user, no auth, per F1).

## 3. Architecture

The architecture mirrors F1's strict layering:

```
apps/web (SPA)
   ↓ HTTP
apps/api (Fastify + BullMQ worker, same process)
   ├─ routes/{materials,templates,generations,settings}.ts
   ├─ jobs/generate-job.ts
   └─ crypto + prisma + queue (already F1)
   ↓ SQL + pgvector
postgres (with pgvector extension)
   ↑ embeddings via OpenAI HTTP
packages/core (pure)
   ├─ llm/{openai,anthropic,openrouter}.ts   (3 LLMProvider adapters)
   ├─ llm/embeddings.ts                     (EmbeddingProvider)
   ├─ generation/{pipeline,parse,schema}.ts (pure)
   └─ tests (golden-file + fetch-mock fixtures)
```

Three invariants carry over from F1:

- `packages/core` is pure — adapters use `globalThis.fetch` injected at the boundary (the worker), and the embedding provider does the same.
- TS strict + `noUncheckedIndexedAccess` on every package.
- TDD: every LLM adapter, every parse path, every job step has unit tests against `vi.spyOn(globalThis, 'fetch')` mocks.

A new invariant for F2:

- **Repro pinning.** `Generation.templateId` records the EXACT template version that produced the output. Re-running a job against the same `templateId` is the determinism guarantee. Edits to a template never mutate prior versions.

## 4. Data model

All tables via Prisma migrations. Three new models + one extending.

```prisma
model Material {
  id          String   @id @default(cuid())
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  type        String                              // 'url' | 'file' | 'note'
  title       String
  content     String                              // plain text (no HTML)
  contentHash String                              // sha256 hex, hex of normalized content
  embedding   Unsupported("vector(1536)")?        // pgvector raw, nullable until first embed
  metadata    Json     @default("{}")             // { chunkOf?, charCount?, sourceUrl?, originalFilename? }
  createdAt   DateTime @default(now())

  @@index([projectId])
  @@unique([projectId, contentHash])
}

model Setting {
  key             String   @id                   // e.g. 'openai_api_key', 'anthropic_api_key'
  valueCiphertext String                          // AES-256-GCM (apps/api/src/crypto.ts)
  updatedAt       DateTime @updatedAt
}

model GenerationTemplate {
  id           String           @id @default(cuid())
  name         String
  version      Int              @default(1)
  isActive     Boolean          @default(false)
  prompt       String                              // template body with {{placeholders}}
  outputSchema Json                                // description of expected output shape (no Zod object)
  createdAt    DateTime         @default(now())
  generations  Generation[]

  @@unique([name, version])
  @@index([isActive])
}

model Generation {
  id                String   @id @default(cuid())
  projectId         String
  project           Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  templateId        String
  template          GenerationTemplate @relation(fields: [templateId], references: [id])
  materialIds       String[]                            // material IDs the user pinned for this generation
  prompt            String                              // user's natural-language prompt
  status            String                              // 'queued' | 'running' | 'completed' | 'failed'
  llmConfig         Json                                // { provider, model, temperature, maxTokens }
  sources           Json                                // top-K used at runtime: [{ materialId, score, excerpt }]; may differ from materialIds when retrieval drops low-score sources below threshold
  outputMarkdown    String?
  outputFrontMatter Json?
  reviewState       String   @default('draft')           // 'draft' | 'in_review' | 'approved'
  reviewNotes       String?
  usage             Json?                                // { promptTokens, completionTokens, provider, model }
  startedAt         DateTime?
  finishedAt        DateTime?
  createdAt         DateTime @default(now())

  @@index([projectId])
  @@index([status])
  @@index([reviewState])
}
```

### 4.1 Schema notes

- `Material.embedding` is `vector(1536)` from pgvector; `Unsupported("vector(1536)")` is Prisma's escape hatch for non-native types. The api worker talks to it via raw SQL through `prisma.$queryRaw` / `$executeRaw` (no Prisma Client API for `vector` types yet).
- `Material.contentHash` uses SHA-256 of normalized content (whitespace-collapsed). The unique constraint `(projectId, contentHash)` prevents double-embedding the same text within a project.
- `Setting.valueCiphertext` uses the existing AES-256-GCM helpers in `apps/api/src/crypto.ts` with `JHEO_SECRET_KEY`. Same envelope as DistributionChannel rows (which F3 will use).
- `GenerationTemplate.@@unique([name, version])` plus the `@@index([isActive])` lets the api enforce "only one active version per name" via a partial unique index pattern (Prisma expresses this with `@@index` + worker logic; absolute uniqueness is best-effort, not DB-enforced, since partial indexes aren't typed in Prisma's schema DSL).
- `Generation.sources` snapshots the exact top-K used. This is what makes a generation auditable: given a generationId, you can re-derive the LLM input.

### 4.2 Review state machine

```
       POST {action: 'send_to_review'}
 draft ───────────────────────────────→ in_review
   ↑                                       │
   │ POST {action: 'reject', notes?}       │ POST {action: 'approve'}
   └───────────────────────────────────────┘
                   in_review
                          │
                          ↓ POST {action: 'approve'}
                       approved
```

`approved` is terminal for F2 (F3 may add a `publishing` state when distribution lands).

Transitions are explicit and idempotent: a `send_to_review` on an `in_review` row is a no-op (returns 200 with the unchanged row). UI buttons correspond 1:1.

## 5. Endpoints

Base path `/api`. JSON in/out except where noted. All routes require `JHEO_SECRET_KEY` env at startup (already in F1); no auth (single-user).

### 5.1 Materials

| Method | Path | Body | Behavior |
|---|---|---|---|
| GET | `/api/projects/:projectId/materials` | — | List project's materials. Embedding-status: `null`/`ready` per row. |
| POST | `/api/projects/:projectId/materials` | `{ type: 'url'\|'file'\|'note', title, source }` | URL: fetch + extract main content (via `@mozilla/readability` + jsdom). File: raw text (multipart with `filename`). Note: text. Persist row, enqueue embed if not already embedded. |
| DELETE | `/api/materials/:id` | — | Cascade. |

### 5.2 Templates

| Method | Path | Body | Behavior |
|---|---|---|---|
| GET | `/api/templates` | — | List (each row has `isActive`, `version`). |
| GET | `/api/templates/:id` | — | Single. |
| POST | `/api/templates` | `{ name, prompt, outputSchema }` | Creates v1 if `name` is new; otherwise 409. |
| PUT | `/api/templates/:id` | `{ prompt, outputSchema }` | Creates a new version row with `version = max(version WHERE name = this.name) + 1`. Source row is preserved. |
| PATCH | `/api/templates/:id/active` | — | Sets `isActive = true` for this row; sets `isActive = false` for siblings with the same `name`. |

### 5.3 Generations

| Method | Path | Body | Behavior |
|---|---|---|---|
| POST | `/api/projects/:projectId/generations` | `{ prompt, templateId, materialIds: string[], llmConfig: { provider, model, temperature?, maxTokens? } }` | Insert `Generation(status=queued)`, enqueue `generate.run`. |
| GET | `/api/projects/:projectId/generations` | — | List. |
| GET | `/api/generations/:id` | — | Detail incl. `sources`, `outputMarkdown`, `usage`. |
| POST | `/api/generations/:id/review` | `{ action: 'send_to_review' \| 'approve' \| 'reject', notes? }` | State machine transition. |
| PATCH | `/api/generations/:id` | `{ outputMarkdown }` | Edit body in `draft`/`in_review`. Frontmatter is locked unless a follow-up field is added. |

### 5.4 Settings

| Method | Path | Body | Behavior |
|---|---|---|---|
| GET | `/api/settings` | — | List keys (no values). |
| PUT | `/api/settings/:key` | `{ value: string }` | Encrypt + upsert. |
| DELETE | `/api/settings/:key` | — | Delete. |

### 5.5 Status flows

**POST `/api/projects/:projectId/generations`** → `Generation(status=queued)` + `auditQueue.add('generate.run', { generationId })`.
**Worker** runs: `queued → running → completed`/`failed`. Persists `outputMarkdown`, `outputFrontMatter`, `sources`, `usage`. Persists `startedAt`/`finishedAt`.

## 6. Generation core (`packages/core/src/generation/`)

```ts
// schema.ts
import { z } from 'zod';

export const FrontMatterSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/).max(80),
  description: z.string().min(50).max(160),
  tags: z.array(z.string().min(1).max(40)).min(1).max(8),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sources: z.array(z.string()).min(0),
  targetSites: z.array(z.string().min(1)).min(1),
});

export const ParsedMarkdownSchema = z.object({
  frontMatter: FrontMatterSchema,
  body: z.string().min(50),
});
export type ParsedMarkdown = z.infer<typeof ParsedMarkdownSchema>;

// parse.ts
export interface ParseResult {
  ok: boolean;
  parsed?: ParsedMarkdown;
  raw: string;
  error?: string;          // 'no-frontmatter' | 'invalid-yaml' | 'schema-violation' | ...
}

// pipeline.ts
export interface GenerationContext {
  prompt: string;
  template: { prompt: string; outputSchema: unknown };
  retrievedMaterials: { id: string; title: string; excerpt: string; score: number }[];
  llmConfig: { provider: string; model: string; temperature?: number; maxTokens?: number };
  fetchFn: typeof fetch;
  signal?: AbortSignal;
}

export interface GenerationResult {
  parsed: ParsedMarkdown;
  raw: string;
  sources: { id: string; score: number; excerpt: string }[];
  usage: { promptTokens: number; completionTokens: number; provider: string; model: string };
}

export async function runGeneration(
  ctx: GenerationContext,
  providers: { llm: Record<string, LLMProvider>; embed: EmbeddingProvider },
): Promise<GenerationResult>;
```

### 6.1 Pipeline detail

1. Build prompt: substitute `{{userPrompt}}`, `{{sources}}`, `{{outputSchemaDescription}}` into `template.prompt` (simple `{{key}}` placeholder replacement, no Handlebars).
2. Call `providers.llm[provider].complete(...)`.
3. `parseMarkdownWithFrontmatter(raw)` → on `parseError`, retry once with appended corrective suffix (`"---\nIMPORTANT: previous response failed schema validation; re-emit valid YAML frontmatter and body."`). Persistent failure throws; the worker catches and writes `status=failed`.
4. Validate `parsed.frontMatter` against `FrontMatterSchema`.
5. Return `GenerationResult`.

### 6.2 Prompt template substitution

Substitution rules:

- Plain string keys: `{{key}}` → value.
- Strict: unknown keys throw (so template authors don't accidentally leave a `{{foo}}` placeholder).
- `{{sources}}` formats the top-K as `[{"id","title","excerpt"}]` JSON for the LLM to consume.

YAML body example:

```yaml
template:
  name: 'blog-post'
  version: 1
  prompt: |
    You are a staff technical writer. Produce a blog post.

    Goal: {{userPrompt}}
    Audience: SEO-savvy engineering managers.

    Cite these materials as you write:
    {{sources}}

    Output YAML frontmatter + markdown body, matching this schema:
    {{outputSchemaDescription}}
```

## 7. LLM adapters (`packages/core/src/llm/`)

```ts
// types.ts
export interface LLMRequest {
  prompt: string;
  system?: string;
  config: { model: string; temperature?: number; maxTokens?: number };
  signal?: AbortSignal;
}

export interface LLMResponse {
  text: string;
  usage: { promptTokens: number; completionTokens: number };
  provider: string;
  model: string;
}

export interface LLMProvider {
  complete(req: LLMRequest, fetchFn: typeof fetch): Promise<LLMResponse>;
}

export interface EmbeddingProvider {
  embed(inputs: string[], fetchFn: typeof fetch, signal?: AbortSignal): Promise<number[][]>;
}
```

Each adapter:

- Does NOT import `node:*`, `dotenv`, or `fetch` directly. `fetch` arrives via the worker.
- For OpenAI/Anthropic/OpenRouter the API key arrives via the worker's closure (passed as part of `fetchFn` URL or headers).
- Adapter signature is `(req, fetchFn)` — uniform.

### 7.1 OpenAI

- POST `https://api.openai.com/v1/chat/completions` with `{ model, messages: [{role: 'system', content: system}, {role: 'user', content: prompt}], temperature, max_tokens }`. Authorization: `Bearer <OPENAI_API_KEY>`.
- Returns `{ text: response.choices[0].message.content, usage: response.usage, provider: 'openai', model }`.

### 7.2 Anthropic

- POST `https://api.anthropic.com/v1/messages` with `{ model, system, messages: [{role: 'user', content: prompt}], max_tokens, temperature }`. Headers: `x-api-key: <ANTHROPIC_API_KEY>`, `anthropic-version: 2023-06-01`.
- Returns `{ text: response.content[0].text, usage: { promptTokens: response.usage.input_tokens, completionTokens: response.usage.output_tokens }, provider: 'anthropic', model }`.

### 7.3 OpenRouter

- POST `https://openrouter.ai/api/v1/chat/completions` (OpenAI-compatible).
- Authorization: `Bearer <OPENROUTER_API_KEY>`.
- Returns `text` field identical to OpenAI.

### 7.4 Embeddings

- Single provider: OpenAI text-embedding-3-small (1536 dimensions).
- POST `https://api.openai.com/v1/embeddings` with `{ model: 'text-embedding-3-small', input: string[] }`. Returns `{ data: [{ embedding: number[] }, ...] }`.
- The worker batches up to 50 inputs per request.

## 8. Worker job

`apps/api/src/jobs/generate-job.ts` — BullMQ worker for the `generate` queue with `concurrency=3`.

```ts
export type GenerateJobData = { generationId: string };

export function makeGenerateHandler(deps: {
  fetchFn: typeof fetch;
  embedProvider: EmbeddingProvider;
  llmProviders: Record<string, LLMProvider>;
}) {
  return async function handle(job: Job<GenerateJobData>): Promise<void> {
    const generation = await prisma.generation.findUnique({ where: { id: job.data.generationId } });
    if (!generation) return;
    await prisma.generation.update({
      where: { id: generation.id },
      data: { status: 'running', startedAt: new Date() },
    });

    const project = await prisma.project.findUnique({ where: { id: generation.projectId } });
    if (!project) throw new Error('project not found');

    const materials = await prisma.material.findMany({
      where: { id: { in: generation.materialIds } },
    });

    // 1. Embed any materials that lack an embedding vector.
    for (const m of materials) {
      if (m.embedding === null) {
        const [vec] = await deps.embedProvider.embed([m.content], deps.fetchFn);
        await prisma.$executeRaw`
          UPDATE "Material" SET embedding = $1::vector WHERE id = ${m.id}
        `;
      }
    }

    // 2. Embed user prompt + retrieve top-K via cosine similarity.
    const [qvec] = await deps.embedProvider.embed([generation.prompt], deps.fetchFn);
    const ranked = await prisma.$queryRaw<Array<{ id: string; title: string; content: string; score: number }>>`
      SELECT m.id, m.title, m.content,
             1 - (m.embedding <=> ${qvec}::vector) AS score
      FROM "Material" m
      WHERE m."projectId" = ${project.id} AND m.embedding IS NOT NULL
      ORDER BY m.embedding <=> ${qvec}::vector
      LIMIT 5
    `;
    // threshold filter
    const topK = ranked.filter((r) => r.score >= SIMILARITY_THRESHOLD);

    // 3. Run generation.
    const result = await runGeneration(
      {
        prompt: generation.prompt,
        template: { prompt: generation.template.prompt, outputSchema: generation.template.outputSchema },
        retrievedMaterials: topK.map((m) => ({ id: m.id, title: m.title, excerpt: m.content.slice(0, 2000), score: m.score })),
        llmConfig: generation.llmConfig as { provider: string; model: string; temperature?: number; maxTokens?: number },
        fetchFn: deps.fetchFn,
      },
      { llm: deps.llmProviders, embed: deps.embedProvider },
    );

    // 4. Persist.
    await prisma.generation.update({
      where: { id: generation.id },
      data: {
        status: 'completed',
        finishedAt: new Date(),
        outputMarkdown: result.raw,
        outputFrontMatter: result.parsed.frontMatter,
        sources: result.sources,
        usage: result.usage,
      },
    });
  };
}
```

Constants:
- `SIMILARITY_THRESHOLD = 0.78` (Cosine).
- `TOP_K = 5`.

## 9. UI (`apps/web`)

Five new pages + Settings + Settings API client.

### 9.1 Pages

| Page | Path | Purpose |
|---|---|---|
| `MaterialsList` | `/projects/:projectId/materials` | List materials; form to add URL/note/file; delete; show embed status. |
| `TemplatesList` | `/templates` | List templates with version + active badge; new template button; activate button. |
| `TemplateEditor` | `/templates/:templateId` | Edit `prompt`, `outputSchema`, `name`. Save creates a new version row. |
| `GenerationComposer` | `/projects/:projectId/compose` | Form: prompt textarea, multi-select materials (search), template dropdown, llmConfig (provider, model, temperature, maxTokens). Submit queues the job. |
| `GenerationReview` | `/generations/:generationId` | Split view: rendered Markdown (left), source list with excerpts (right). State badge + state-machine buttons (`Send to Review`, `Approve`, `Reject with notes`). Polls until `status !== queued | running`. |
| `Settings` | `/settings` | API-keys list (no values shown); form to PUT a key; delete. |

### 9.2 Routing

```
/projects/:projectId                    -> Projects dashboard (existing)
/projects/:projectId/materials          -> NEW
/projects/:projectId/compose            -> NEW
/templates                              -> NEW
/templates/:templateId                  -> NEW
/generations/:generationId              -> NEW
/settings                               -> NEW
```

### 9.3 Source highlight

In `GenerationReview`, each material's `excerpt` is highlighted when overlapping strings appear in the rendered output. Implementation: render `outputMarkdown` to plain text once at load, do substring-case-insensitive highlight on the rendered output. No fuzzy match (YAGNI).

## 10. Configuration & environment

Same `.env.local` envelope as F1. New optional env var:

- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` — env-var fallback if `Setting` row is absent.

Worker chooses the key in priority order: `Setting` row → env var → unset (worker errors gracefully if no key is present for the requested provider).

The Dockerfile's runner stage already has the previous schema pushed (no new migration needed beyond `prisma db push --skip-generate`, which works after F1's followup commit).

## 11. Testing strategy

Same layered approach as F1.

- **`@jheo/core` unit:** Vitest. Mock `globalThis.fetch` with `vi.spyOn`. Each LLM adapter has 4–6 tests covering happy path, 4xx, 5xx, rate-limit, parse-retry. Each parse path has YAML variants (good, bad YAML, missing fields, malformed body).
- **`apps/api` integration:** Validation tests against the in-memory Fastify server (DB-touching tests skip-when-no-db using the same `prisma.$queryRaw` precheck pattern F1 established). Settings have an encrypt/decrypt round-trip test using the real `JHEO_SECRET_KEY`.
- **`apps/api` worker:** `generate-job.test.ts` orchestrates the whole pipeline against `vi.mock('@jheo/core')` plus mocked `globalThis.fetch`, asserting that the Generation row transitions through statuses and ends with populated `outputMarkdown` + `sources` + `usage`.
- **`apps/web`:** `GenerationReview.test.tsx` verifies state-machine buttons trigger the right mutations. `MaterialsList.test.tsx` covers add+delete with mocked fetch.
- **End-to-end smoke** (manual, after `docker compose up`):
  1. Create project.
  2. Add 1 URL material.
  3. Wait for embed (poll status).
  4. Activate the seed template.
  5. Compose a generation → wait → review → approve.
  6. Verify `Generation.outputMarkdown` is non-empty and `outputFrontMatter` parses.

## 12. Out-of-scope questions deferred

- Streaming responses (next phase, if UX demands).
- Per-token $ aggregations.
- Embedding provider switcher (currently OpenAI-only).
- Readability fallback for sites with poor structure (the system emits the URL content; if extraction is empty, the user sees an empty note and adjusts).

## 13. Open assumptions explicitly called out

- **Note vs file vs URL material types** all share the same `content` storage as plain text. PDFs are out of scope for MVP — file uploads accept `.md`, `.txt`, plain-text `.html` (extracted via Readability). Extending to PDFs in F2.5.
- **Top-K + threshold are constants.** A future F2.5 could expose them as `Project.config`.
- **`fetchFn` injection is uniform across adapters.** If a future provider needs different isolation (e.g. custom retry), it's an extension point — not a refactor.
- **Review state machine is F2-flat:** `reject` from `in_review` returns to `draft`. `approve` is terminal. Future F3 may add a `publishing` and `published` state — would require a small migration.
- **Settings UI shows key *names*, never values.** Same security posture as the audit job's secrets envelope: values are write-only.
- **API-key fallback is plain env var, not Vault / not session.** Out of MVP.

## 14. Amends to F1 spec

While brainstorming F2, the F1 spec has these minor amendments:

- §7.2 interface — drop the `schema?: ZodSchema<any>` field (LLMs can't safely produce typed JSON; we validate after the fact in `core`).

The F1 spec remains the canonical design document for F1; this doc supplements it for F2.
