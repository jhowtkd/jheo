# JHEO F3 — Distribution Design

**Status:** approved
**Date:** 2026-07-06
**Author:** brainstorming refinement of F1 spec §8
**Depends on:** `2026-07-06-jheo-design.md` (F1), `2026-07-06-jheo-f2-design.md` (F2)

## 1. Purpose

F3 enables approved generations to be **distributed to external destinations** via three publisher adapters and a per-project channel registry. The deliverable: from an approved generation, the user picks 1+ channels, the system fans out one publish job per channel, retries on transient failure, supports cancellation, and surfaces the result back in the UI. State transitions are explicit (`approved → publishing → published`) and failure is non-destructive.

This design covers the full scope: WordPress REST adapter, generic HTTP adapter, GEOFlow Agent bundle adapter, channels CRUD with encrypted credentials, retry + cancel on the worker, and a SPA component to manage channel selection + per-publish retries.

## 2. Non-goals

- Multi-tenant or shared channels across projects (channels are project-scoped, period).
- Per-user API tokens / OAuth flows.
- Real-time progress streaming over SSE/WebSocket (UI polls 2s).
- Automatic multi-region WordPress support.
- Image upload handling (out of scope for MVP — body content is text).
- Cost tracking / per-channel spend.

## 3. Architecture

```
apps/web (SPA)
   ↓ HTTP
apps/api (Fastify + BullMQ worker, same process)
   ├─ routes/{channels,publishes}.ts
   ├─ jobs/publish-job.ts
   └─ crypto + prisma + queue (existing)
   ↓ SQL + pgvector (F2) + Prisma client (F3)
postgres
   ↑ adapters reach out
packages/core (pure)
   ├─ distribution/wordpress.ts
   ├─ distribution/http.ts
   ├─ distribution/agent.ts
   ├─ distribution/aggregate.ts
   └─ tests (golden-file + fetch-mock)
```

Three invariants carry over from F1/F2:

- `@jheo/core` is pure — adapters take `fetchFn` (F2 pattern).
- TS strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.
- AES-256-GCM envelope (existing `apps/api/src/crypto.ts`) for channel `configEncrypted`.

Two new invariants for F3:

- **One publish per (generation, channel)** — `@@unique([generationId, channelId])` enforces; UI shows matrix.
- **Generation state aggregates publishes** — pure function `aggregateReviewState` recomputes after each publish; worker calls it to persist back.

## 4. Data model

```prisma
model DistributionChannel {
  id               String   @id @default(cuid())
  projectId        String                                       // NEW: relation to Project
  project          Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  type             String                                       // 'wordpress' | 'http' | 'agent'
  name             String
  configEncrypted  String
  configSchema     String                                       // JSON schema for type-specific config
  isActive         Boolean  @default(true)
  createdAt        DateTime @default(now())
  publishes        Publish[]

  @@index([projectId])
  @@index([type])
}

model Publish {
  id             String   @id @default(cuid())
  generationId   String
  generation     Generation @relation(fields: [generationId], references: [id], onDelete: Cascade)
  channelId      String
  channel        DistributionChannel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  status         String   @default("queued")                    // 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  attempts       Int      @default(0)
  externalId     String?
  externalUrl    String?
  response       Json?                                          // truncated 1KB
  lastError      String?
  startedAt      DateTime?
  finishedAt     DateTime?
  createdAt      DateTime @default(now())

  @@index([generationId])
  @@index([channelId])
  @@index([status])
  @@unique([generationId, channelId])
}
```

**Modifications to existing models:**

- `Generation.reviewState` enum expands: `'draft' | 'in_review' | 'approved' | 'publishing' | 'published'`.
- `Project` gains relation `distributionChannels DistributionChannel[]` and `publishes Publish[]` (via Generation).
- `DistributionChannel` gains `projectId` + `project` relation (F1 stub had no FK to Project).

### 4.1 Schema notes

- `@@unique([generationId, channelId])` is the multi-channel fan-out guard: you can't queue two publishes for the same (gen, channel). UX: a "Publish" button in UI shows once per channel combo.
- `response Json?` is truncated to 1KB at write-time to avoid ballooning the row. The full body is captured in logs only.
- `configSchema String` stores the type-specific Zod-schema-as-string. Used at PUT time to validate `config` payloads against the right shape.

### 4.2 Channel config shapes (per `type`)

| type | config |
|---|---|
| `wordpress` | `{ siteUrl (https://…), username (user), appPassword (Application Password), defaultStatus ('draft'\|'publish' default 'draft') }` |
| `http` | `{ endpointUrl, method ('POST' default), headers Record<string,string>, bodyTemplate? (Handlebars-style), auth? ({ scheme: 'none'\|'basic'\|'bearer', username?, password?, token? }), responsePath? ({ externalId?, externalUrl? } — JSONPath strings) }` |
| `agent` | `{ siteName, themeColor? (#hex default '#0ea5e9'), assetFolder? default 'assets' }` |

Validation happens at the route boundary via type-discriminated Zod schemas per `type`.

## 5. State machine

```
       POST /api/generations/:id/publish { channelIds }
approved ───────────────────────────────────────────────────→ publishing
   ↑                                                            │
   │ POST /api/generations/:id/unpublish                       │ all publishes
   │ (admin)                                                    ↓ completed
   └────────────────────────────────────────────────────→ published

# Within 'publishing':
#   per-publish statuses cycle independently: queued → running → completed | failed | cancelled
#   Generation stays 'publishing' if ANY publish is queued/running
#   Generation → 'published' when ALL selected publishes are terminal+success
```

`approved → publishing` requires N selected channels (N≥1). `publishing` is reversible only by `unpublish` (admin-only); F3 MVP doesn't expose unpublish via UI (it's covered by cancel + retry per publish).

## 6. Endpoints

Base path `/api`. JSON in/out except where noted. No auth (single-user, F1 invariant).

### 6.1 Channels

| Method | Path | Body | Behavior |
|---|---|---|---|
| GET | `/api/projects/:projectId/channels` | — | List project's channels (no decrypted config exposed). |
| POST | `/api/projects/:projectId/channels` | `{ name, type, config }` | Validate config against type schema; encrypt; create row. |
| GET | `/api/channels/:id` | — | Detail with **decrypted** config (owner only — same auth model as F1 single-user). |
| PUT | `/api/channels/:id` | `{ name?, config?, isActive? }` | Patch. Re-encrypt if config changed. |
| DELETE | `/api/channels/:id` | — | Cascade deletes publishes. |

### 6.2 Publishes

| Method | Path | Body | Behavior |
|---|---|---|---|
| POST | `/api/generations/:id/publish` | `{ channelIds: string[] }` | Validate generation is `approved`. Validate channels belong to project & `isActive=true`. Validate uniqueness (`@@unique([generationId, channelId])`). Create N `Publish` rows `status=queued`. Transition generation → `publishing`. Enqueue jobs. |
| GET | `/api/generations/:id/publishes` | — | List publishes for the generation (no decrypted configs). |
| GET | `/api/publishes/:id` | — | Detail with `externalId/url/lastError/response`. |
| POST | `/api/publishes/:id/retry` | — | If status is `failed` or `cancelled`, reset to `queued` + enqueue. Returns 409 if already running/succeeded. |
| POST | `/api/publishes/:id/cancel` | — | If status is `queued`, set `cancelled` immediately. If `running`, mark `cancelled` so worker poll detects and aborts. Returns 409 if terminal. |
| GET | `/api/publishes/:id/bundle` | — | (Only `type=agent`.) Returns zip stream of bundle files. |
| GET | `/api/publishes/:id/files` | — | (Only `type=agent`.) Returns JSON list of files with content (for in-browser view). |

### 6.3 Status flow

`POST /api/generations/:id/publish`:
- Generation row found & `reviewState === 'approved'`. Otherwise 409.
- Validate all channelIds exist, belong to project, `isActive=true`.
- Create `Publish` rows. `(generationId, channelId)` `@@unique` enforces idempotency.
- Transition `Generation.reviewState: approved → publishing`.
- Enqueue job per Publish (BullMQ `publish` queue, concurrency=3).

Worker per publish:
- `queued → running` (startedAt, attempts++).
- Decrypt channel config.
- Acquire publisher by `channel.type`, build `PublishRequest` from `Generation.outputMarkdown` (parsed) + `config`.
- Run with `AbortSignal`: cancel-polled between network calls.
- On success → `completed`, persist `externalId/url/response`, set `finishedAt`. Recompute aggregate reviewState.
- On retryable error (5xx, 408, 429, network) → if `attempts < maxAttempts`, set `queued` + enqueue with backoff; else `failed`, persist `lastError`. Aggregate recompute.
- On non-retryable (4xx except above) → `failed`. Aggregate recompute.
- On `cancelled` detected during poll → `cancelled`. Aggregate recompute.

After each publish transition, worker calls `computeAggregateReviewState(publishes)` and updates `Generation.reviewState` if it differs.

## 7. Core: publishers (`packages/core/src/distribution/`)

```ts
// types.ts
export interface PublishRequest {
  content: ParsedMarkdown;   // { frontMatter, body }
  config: unknown;            // adapter-specific; worker decrypts before call
  signal?: AbortSignal;
}

export interface PublishResult {
  externalId?: string;
  externalUrl?: string;
  raw: { status: number; headers: Record<string, string>; body: string };
}

export interface Publisher {
  type: 'wordpress' | 'http' | 'agent';
  publish(req: PublishRequest, fetchFn: typeof fetch): Promise<PublishResult>;
}
```

### 7.1 `wordpress.ts`

- POST `https://{siteUrl}/wp-json/wp/v2/posts`.
- Auth: `Authorization: Basic base64(username:appPassword)`.
- Body: `{ title, content, excerpt, slug, status, categories, tags }` from `content.frontMatter` + body.
- Categories + tags: name-match against existing WP terms via `GET /wp/v2/categories?search={name}` and `.../tags?search={name}`. Create if missing.
- Status: from `config.defaultStatus` (default `'draft'`).
- Returns `{ externalId: data.id, externalUrl: data.link, raw }`.

### 7.2 `http.ts`

- POST to `config.endpointUrl` with `config.headers` + JSON body.
- If `bodyTemplate` provided, substitute `{{frontMatter.<key>}}` and `{{body}}` against `content`. Otherwise, send full parsed JSON.
- Auth: `config.auth.scheme`:
  - `none`: no auth headers.
  - `basic`: `Authorization: Basic base64(username:password)`.
  - `bearer`: `Authorization: Bearer {token}`.
- JSONPath extraction: if `config.responsePath.externalId`/`externalUrl` provided, evaluate against response body. Both optional.
- Returns `{ externalId?, externalUrl?, raw }`.

### 7.3 `agent.ts`

- Generate bundle in memory under `outputDir = /data/agent-bundles/<publishId>/` (created on demand).
- Files:
  - `index.html` — semantic home template (theme color, site name, nav placeholders).
  - `article.html` — `<article>` from `content.frontMatter` + body (rendered to semantic HTML, not raw Markdown).
  - `llms.txt` — `# <name>` H1 + body summary (first 2000 chars).
  - `robots.txt` — `User-agent: *\nAllow: /`.
  - `sitemap.xml` — single `<url>` entry.
  - `assets/` — empty placeholder.
- Save to filesystem; populate `Publish.externalUrl` with the directory path.
- Use existing fs, no new deps beyond what Node ships.

## 8. Worker (`apps/api/src/jobs/publish-job.ts`)

```ts
const BACKOFF_SECONDS = [0, 30, 300]; // attempt 1, 2, 3 — index by attempts-1
const MAX_ATTEMPTS_DEFAULT = 3;

export type PublishJobData = { publishId: string };

export function makePublishHandler(deps: {
  prisma: PrismaClient;
  fetchFn: typeof fetch;
  publishers: Record<'wordpress' | 'http' | 'agent', Publisher>;
}) {
  return async function handle(job: Job<PublishJobData>): Promise<void> {
    const { prisma } = deps;
    const publish = await prisma.publish.findUnique({
      where: { id: job.data.publishId },
      include: { generation: true, channel: true },
    });
    if (!publish) return;
    if (publish.status === 'cancelled') return;

    await prisma.publish.update({
      where: { id: publish.id },
      data: { status: 'running', startedAt: new Date(), attempts: { increment: 1 } },
    });

    // 1. Decrypt channel config.
    const env = loadEnv();
    const secret = env.JHEO_SECRET_KEY;
    if (!secret) {
      await prisma.publish.update({
        where: { id: publish.id },
        data: { status: 'failed', finishedAt: new Date(), lastError: 'JHEO_SECRET_KEY missing' },
      });
      await recomputeGenerationReviewState(prisma, publish.generationId);
      return;
    }
    const config = decrypt(JSON.parse(publish.channel.configEncrypted), secret) as never;

    // 2. Pick publisher.
    const publisher = deps.publishers[publish.channel.type as 'wordpress' | 'http' | 'agent'];
    if (!publisher) {
      await prisma.publish.update({
        where: { id: publish.id },
        data: { status: 'failed', finishedAt: new Date(), lastError: `no publisher for type=${publish.channel.type}` },
      });
      await recomputeGenerationReviewState(prisma, publish.generationId);
      return;
    }

    // 3. Build request.
    const content = JSON.parse(publish.generation.outputMarkdown ?? '{}') as never;
    const req: PublishRequest = {
      content,
      config,
      signal: jobCancelledSignal(publish.id, deps.prisma),
    };

    try {
      const result = await publisher.publish(req, deps.fetchFn);
      await prisma.publish.update({
        where: { id: publish.id },
        data: {
          status: 'completed',
          finishedAt: new Date(),
          externalId: result.externalId,
          externalUrl: result.externalUrl,
          response: { status: result.raw.status, body: result.raw.body.slice(0, 1024) },
        },
      });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      const retryable = !e.status || e.status >= 500 || e.status === 408 || e.status === 429;
      if (retryable && publish.attempts < MAX_ATTEMPTS_DEFAULT) {
        // Reschedule with backoff.
        await prisma.publish.update({ where: { id: publish.id }, data: { status: 'queued', lastError: e.message } });
        await publishQueue.add('run', { publishId: publish.id }, {
          delay: BACKOFF_SECONDS[publish.attempts] * 1000,
        });
      } else {
        await prisma.publish.update({
          where: { id: publish.id },
          data: { status: 'failed', finishedAt: new Date(), lastError: e.message },
        });
      }
    }

    // 4. Recompute aggregate reviewState.
    await recomputeGenerationReviewState(prisma, publish.generationId);
  };
}
```

`recomputeGenerationReviewState` reads all publishes for the generation, calls `aggregateReviewState`, updates if different.

**Cancellation pattern** (`jobCancelledSignal`): returns an `AbortSignal` that aborts when this publish's status is observed `cancelled`. Implementation: simple poll loop — there's a known latency (signal is checked between adapter calls, not within network roundtrips). For F3 MVP this is acceptable; F3.5 can add pub/sub via Redis.

## 9. Aggregation (`packages/core/src/distribution/aggregate.ts`)

```ts
export type PublishStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export function aggregateReviewState(publishes: { status: PublishStatus }[]): ReviewState {
  if (publishes.length === 0) return 'approved';
  const hasActive = publishes.some((p) => p.status === 'queued' || p.status === 'running');
  if (hasActive) return 'publishing';
  const allSucceeded = publishes.every((p) => p.status === 'completed');
  if (allSucceeded) return 'published';
  return 'approved'; // some failed or cancelled — operator can retry
}
```

Pure, in `core`, tested with golden file.

## 10. API: routes

Channels CRUD — same patterns as F2 materials/templates. Settings.tsx pattern is the canonical: zod validation, encrypt via existing crypto.ts, prisma write, surfacing meaningful errors.

Publishes — auth via existing `auditQueue`-style wiring from F1 (concurrency=3). Enqueue via `publishQueue.add('run', { publishId }, opts)` with optional `delay`.

Config validation per type — three zod schemas. Pseudocode:

```ts
const ConfigByType = {
  wordpress: z.object({
    siteUrl: z.string().url(),
    username: z.string().min(1),
    appPassword: z.string().min(1),
    defaultStatus: z.enum(['draft', 'publish']).default('draft'),
  }),
  http: z.object({
    endpointUrl: z.string().url(),
    method: z.enum(['POST']).default('POST'),
    headers: z.record(z.string()).default({}),
    bodyTemplate: z.string().optional(),
    auth: z
      .discriminatedUnion('scheme', [
        z.object({ scheme: z.literal('none') }),
        z.object({ scheme: z.literal('basic'), username: z.string(), password: z.string() }),
        z.object({ scheme: z.literal('bearer'), token: z.string() }),
      ])
      .optional(),
    responsePath: z
      .object({ externalId: z.string().optional(), externalUrl: z.string().optional() })
      .optional(),
  }),
  agent: z.object({
    siteName: z.string().min(1),
    themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0ea5e9'),
    assetFolder: z.string().default('assets'),
  }),
} as const;

function validateConfig(type: string, body: unknown) {
  const schema = ConfigByType[type as keyof typeof ConfigByType];
  if (!schema) throw new Error(`unknown channel type: ${type}`);
  return schema.parse(body);
}
```

## 11. Frontend (`apps/web`)

### 11.1 Pages

| Page | Path | Purpose |
|---|---|---|
| `ChannelsList` | `/projects/:projectId/channels` | List channels per project; create/edit form; toggle active. |
| `ChannelEditor` | `/channels/:id` | Edit name + type-specific config (wordpress: siteUrl+user+password; http: endpoint+headers+bodyTemplate+auth+JSONPaths; agent: siteName+themeColor). |
| `PublishActions` | embedded in `GenerationReview` (after `reviewState === 'approved'`) | Checkbox list of active channels + "Publish to N channels" button. Below: table of publishes with retry/cancel buttons. |
| `PublishDetail` | `/publishes/:id` | externalUrl, lastError, truncated response, retry history. |
| `AgentBundleView` | `/publishes/:id/bundle` | Inline file listing with syntax-highlighted content + "Download zip" button. |

### 11.2 Routing additions

```
/projects/:projectId/channels        → NEW
/channels/:channelId                  → NEW
/publishes/:publishId                 → NEW
/publishes/:publishId/bundle          → NEW (only type=agent)
```

`ProjectDashboard` ganha link "Channels" next to existing "Materials" / "Compose". `GenerationReview` ganha embedded `PublishActions` section.

### 11.3 Type-discriminated forms

`ChannelEditor` switches form fields based on `type`. WordPress: 3 inputs (url/user/password) + status dropdown. HTTP: endpoint + headers editor + bodyTemplate textarea + auth selector + JSONPath extractor. Agent: siteName + themeColor picker + folder name.

## 12. Configuration & environment

Same `.env.local` envelope as F2. No new env vars.

**Worktree:**

- `apps/api` writes agent bundles to `/data/agent-bundles/<publishId>/` inside the docker container (matches F1's existing `/data` placeholder pattern, but the path is configurable per channel — default `assets`). F3 docker-compose mounts `/data` from a docker volume for persistence.

## 13. Testing strategy

- **`packages/core` unit:** Vitest with `vi.spyOn(globalThis, 'fetch')`. ~5 tests per adapter (15+ total) plus 3 aggregate tests.
- **`apps/api` integration:** validation tests + DB-gated tests via `it.runIf(canRunDb)` (F1/F2 pattern).
- **`apps/api/jobs`:** `publish-job.test.ts` orchestrates the full job lifecycle with mocked Prisma + fetch. Exercises retry, cancel, aggregation recompute.
- **`apps/web`:** `ChannelsList.test.tsx`, `ChannelEditor.test.tsx`, `PublishActions.test.tsx` — render forms + button interactions.

**End-to-end smoke (after `docker compose up`):**

1. Create project + add material + create template + run generation + approve.
2. Create WordPress channel (mock URL).
3. Click "Publish to 1 channel".
4. Verify Generation transitions to `publishing` then `published`.
5. Verify Publish row has `externalUrl`.

For HTTP + Agent variants, the worker writes the bundle to `/data/agent-bundles/<id>/`; SPA loads via `/api/publishes/:id/files`.

## 14. Out-of-scope questions deferred

- Per-user OAuth tokens (channels stay single-user-local).
- Image asset upload (out of MVP — bundles ship empty `assets/`).
- Multi-region routing (F3.5).
- Real-time SSE/WebSocket progress (UI polls 2s).
- Automatic cancel-via-AbortController signal across publisher-internal HTTP calls (cancellable only between adapter network calls, not within).
- Cross-publisher atomic transaction (rollback if partial failure mid-fanout).
- Channel-level rate limiting.
- Agent bundle custom theme templates.

## 15. Open assumptions

- **WordPress receiver**: `siteUrl` must include scheme `https://`. HTTP channel rejects non-https to keep TLS assumption.
- **Agent bundle filesystem path**: per `publish.channel.config.assetFolder`, default `/data/agent-bundles`. In docker, this maps to a mounted volume (see §12).
- **No backpressure**: workers don't slow enqueues. With channel concurrency=3 + per-publish retries, a storm of failed publishes will back up the queue. Acceptable for F3.
- **JSONPath**: implemented via `jsonpath-plus` lib (1kb dep). F3 adds this dep.
- **retry policy**: 3 attempts with backoff `0s / 30s / 300s`. Channel config can override `maxAttempts` (1-5).
- **cancellation**: granular per-publish, not per-generation. To cancel all of a generation, the user clicks cancel per channel.
- **agent bundles are public-readable once generated**: the bundle directory has no auth. It's the deployer's job to put it behind their webserver auth. F3 ships bundles that anyone with FS access can read.

## 16. Amends to F1 spec

- `DistributionChannel` gains `projectId` + `project` relation (F1 stub had no FK to Project).
- `Generation.reviewState` enum expands: `+ 'publishing' | 'published'`.

The F1 spec remains canonical for F1; this doc supplements it for F3.

## 17. Amends to F2 spec

- `GenerationTemplate.@@unique([name, version])` semantics unchanged.
- `Generation.outputMarkdown` is the input to `Publisher.publish(req)`. `outputFrontMatter` provides fields like `title`, `slug`, `tags`, `targetSites`. The publisher maps these to the destination's schema.
- `Generation.materialIds` snapshot is unchanged; F3 doesn't reference materials directly (publishes are about outputMarkdown + outputFrontMatter).

The F2 spec remains canonical for F2; this doc supplements it for F3.
