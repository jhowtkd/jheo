# JHEO

Audit, generate, and distribute GEO/SEO content.

JHEO runs an audit pipeline (Fastify API + BullMQ worker + Postgres+pgvector + Redis)
against any URL, scored across six categories — SEO, performance/CWV, GEO/AI-readiness,
accessibility, content, and overall. The SPA dashboard consumes the same API.

## Quickstart

```bash
cp docker/.env.example docker/.env   # only required if you want to override defaults
docker compose -f docker/docker-compose.yml up -d --build
open http://127.0.0.1:8080/app
```

Or via the repo script:

```bash
pnpm run compose:up
```

The compose file brings up three services:

| Service  | Image                       | Host port (default) | Purpose                       |
|----------|-----------------------------|---------------------|-------------------------------|
| postgres | `pgvector/pgvector:pg16`    | `127.0.0.1:5432`    | Project / Audit / Finding store, pgvector-ready |
| redis    | `redis:7-alpine`            | `127.0.0.1:6379`    | BullMQ queue + worker         |
| api      | `docker-api` (built locally)| `127.0.0.1:8080`    | Fastify HTTP API + in-process worker |

If any of those host ports are already in use, override them in `docker/.env`:

```bash
# docker/.env
POSTGRES_PORT=25432
REDIS_PORT=16380
API_PORT=8081
```

(The compose file reads `${POSTGRES_PORT:-5432}`, `${REDIS_PORT:-6379}`,
`${API_PORT:-8080}` — defaults are exactly what's documented above.)

### First-time database bootstrap

The first time you bring the stack up against a fresh `jheo-postgres-data` volume,
the API will start before Prisma has pushed the schema. If `POST /api/projects`
returns a Prisma `P2021` ("table does not exist"), push the schema once:

```bash
docker exec docker-api-1 npx prisma db push --skip-generate
```

(The Dockerfile's `prisma db push` line is currently best-effort and silently
no-ops if `pnpm` is not on the runner's PATH — F2 follow-up will harden this.)

### Smoke test

```bash
PROJ=$(curl -s -X POST http://127.0.0.1:8080/api/projects \
  -H 'content-type: application/json' \
  -d '{"name":"example","domain":"example.com"}')
PID=$(echo "$PROJ" | jq -r .id)
AUDIT=$(curl -s -X POST http://127.0.0.1:8080/api/audits \
  -H 'content-type: application/json' \
  -d "{\"projectId\":\"$PID\",\"config\":{}}")
AID=$(echo "$AUDIT" | jq -r .id)
sleep 8
curl -s http://127.0.0.1:8080/api/audits/$AID | jq '{status, score, findingsCount: (.findings | length), pagesAudited: .score.pagesAudited}'
curl -s http://127.0.0.1:8080/api/projects/$PID | jq '.pages | length'
```

Expected: `status: "completed"`, `score.overall` plus `score.byCategory` populated for
`seo`, `cwv`, `geo`, `a11y`, `content`, `findingsCount > 0`, `pagesAudited ≥ 1`,
and the project detail returns `pages.length ≥ 1`.

### Mapping UX (F5.2)

```bash
# After creating a project (see Smoke test above):
PID=<project-id>
curl -s "http://127.0.0.1:8080/api/projects/$PID/health" | jq
curl -s "http://127.0.0.1:8080/api/projects/$PID/pages?filter=not_audited" | jq '.total'
```

Expected: `/health` returns `{overall: null|number, byCategory: {...}, pagesAudited, pagesTotal, pagesWithError, lastAuditAt}`; `/pages?filter=not_audited` returns the count of pages that have never been audited.

### Parallel audit + cancel (F5.3)

```bash
PID=<project-id>
AUDIT=$(curl -s -X POST http://127.0.0.1:8080/api/audits \
  -H 'content-type: application/json' \
  -d "{\"projectId\":\"$PID\"}")
AID=$(echo "$AUDIT" | jq -r .id)
# Poll progress
for i in 1 2 3 4 5; do curl -s http://127.0.0.1:8080/api/audits/$AID/progress | jq .; sleep 2; done
# Cancel
curl -s -X DELETE http://127.0.0.1:8080/api/audits/$AID | jq .
```

Expected: `pagesCompleted` advances; `DELETE` returns `status: "cancelled"`; the audit halts within ≤ 5s.

### Tearing down

```bash
pnpm run compose:down         # stop and remove containers, keep volumes
docker compose -f docker/docker-compose.yml down -v   # also wipe the postgres volume
```

## UI

`apps/api` does not yet serve the built SPA — that is an F2 follow-up. Until
then, use the Vite dev server:

```bash
pnpm --filter @jheo/web run dev
# → http://127.0.0.1:5173
```

The SPA reads from the same API at `http://127.0.0.1:8080` by default; set
`VITE_API_URL` in `apps/web/.env.local` if you remapped the API host port.

## Repository layout

```
apps/
  api/        Fastify + BullMQ + Prisma (TypeScript, ESM)
  web/        Vite + React + TanStack Query (TypeScript, SPA)
packages/
  core/       @jheo/core — pure audit orchestrator + 26 plugins + score engine
docker/
  docker-compose.yml      Postgres + Redis + api stack
  Dockerfile.api          Multi-stage build, installs Chromium for Puppeteer
  init/                   Postgres init SQL (pgvector extension)
```

`@jheo/core` is intentionally pure — no Node-only APIs, no infra imports — so
the same code that runs in the API also runs in unit tests in isolation.

## Useful scripts

```bash
pnpm run build       # build @jheo/core and @jheo/api
pnpm run test        # run all workspace vitest suites
pnpm run typecheck   # tsc --noEmit across the workspace
pnpm run lint        # prettier --check
pnpm run compose:up       # bring up the docker stack
pnpm run compose:down     # tear it down
pnpm run compose:logs     # tail api logs
```

## Configuration

API env vars (with defaults; override via `docker/.env` for compose, or
process env for `pnpm --filter @jheo/api run dev`):

| Var               | Default                              | Notes                                      |
|-------------------|--------------------------------------|--------------------------------------------|
| `DATABASE_URL`    | `postgres://jheo:jheo@postgres:5432/jheo` | Postgres connection string            |
| `REDIS_HOST`      | `redis` (compose) / `127.0.0.1` (dev)| BullMQ broker host                         |
| `REDIS_PORT`      | `6379`                               |                                            |
| `WEB_PORT`        | `8080`                               | Fastify bind port                          |
| `LOG_LEVEL`       | `info`                               | pino level                                 |
| `JHEO_SECRET_KEY` | (auto-generated on first run)        | Used for channel-config encryption (F2)    |

## F2 — Generation

F2 enables GEO content generation. New routes:

- `GET/POST/DELETE /api/projects/:id/materials` — list/add/delete materials (URL, file, or note).
- `GET/POST/PUT/PATCH /api/templates` — CRUD versioned generation templates.
- `POST /api/projects/:id/generations`, `GET /api/projects/:id/generations`, `GET /api/generations/:id`, `POST /api/generations/:id/review`, `PATCH /api/generations/:id` — generation lifecycle.
- `GET/PUT/DELETE /api/settings/:key` — encrypted API keys.

**Required env vars** (set via `Setting` rows in the UI, or fall back to env vars):

- `OPENAI_API_KEY` (used by embeddings + completion; embeddings fixed at `text-embedding-3-small`).
- `ANTHROPIC_API_KEY` (optional).
- `OPENROUTER_API_KEY` (optional).

**Bring-up curl smoke (after `docker compose up -d`):**

```bash
# add a material via UI or:
curl -X POST http://127.0.0.1:8080/api/projects/<pid>/materials \
  -H 'content-type: application/json' \
  -d '{"type":"note","title":"Apple facts","source":"Apples are red and crisp."}'

# create a template via UI or:
curl -X POST http://127.0.0.1:8080/api/templates \
  -H 'content-type: application/json' \
  -d '{"name":"blog-post","prompt":"You are a writer. Goal: {{userPrompt}}. Sources: {{sources}}. Schema: {{outputSchemaDescription}}.","outputSchema":{"title":"string","slug":"string","description":"string","tags":["string"],"date":"2026-01-01","sources":[],"targetSites":["https://example.com"]}}'

# activate it:
curl -X PATCH http://127.0.0.1:8080/api/templates/<tid>/active

# queue a generation:
curl -X POST http://127.0.0.1:8080/api/projects/<pid>/generations \
  -H 'content-type: application/json' \
  -d '{"prompt":"Write about apples","templateId":"<tid>","materialIds":["<mid>"],"llmConfig":{"provider":"openai","model":"gpt-4o-mini"}}'
```

`GET /api/generations/<gid>` will return the output once the worker completes.

## F3 — Distribution

F3 enables publishing approved generations to external destinations. New routes:

- `GET/POST /api/projects/:id/channels`, `GET/PUT/DELETE /api/channels/:id` — channel CRUD with type-discriminated configs (wordpress, http, agent).
- `POST /api/generations/:id/publish` with `{ channelIds: [...] }` — fans out one `Publish` row per channel; transitions Generation to `publishing`.
- `GET /api/generations/:id/publishes`, `GET /api/publishes/:id`, `POST /api/publishes/:id/retry`, `POST /api/publishes/:id/cancel` — manage publishes.
- `GET /api/publishes/:id/files` and `GET /api/publishes/:id/bundle` (agent only) — in-browser bundle view + zip download.

**Publish state machine** (per-generation):

```
approved → publishing → published (all completed) | approved (some failed/cancelled; retry to recover)
```

**Retry policy:** 3 attempts with backoff 0s → 30s → 5m on retryable errors (5xx, 408, 429, network).

**Smoke curl** (after a `generation.approved`):

```bash
curl -X POST http://127.0.0.1:8080/api/projects/<pid>/channels \
  -H 'content-type: application/json' \
  -d '{"name":"smoke","type":"http","config":{"endpointUrl":"http://127.0.0.1:9999/hook","method":"POST","headers":{}}}'
# Returns { id: <cid> }

curl -X POST http://127.0.0.1:8080/api/generations/<gid>/publish \
  -H 'content-type: application/json' \
  -d "{\"channelIds\":[\"<cid>\"]}"
# Worker will fail with 5xx (unreachable). Inspect via:
curl http://127.0.0.1:8080/api/generations/<gid>/publishes
# Returns row with status='failed' (after 3 retries) or 'completed' if endpoint is reachable.
```

Agent bundles are written to `/data/agent-bundles/<publishId>/` inside the container. The `docker-compose.yml` from F1 already mounts `/data` as a volume; no further config needed.