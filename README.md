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
  -d '{"name":"example","rootUrl":"https://example.com/"}')
PID=$(echo "$PROJ" | jq -r .id)
AUDIT=$(curl -s -X POST http://127.0.0.1:8080/api/audits \
  -H 'content-type: application/json' \
  -d "{\"projectId\":\"$PID\",\"config\":{}}")
AID=$(echo "$AUDIT" | jq -r .id)
sleep 8
curl -s http://127.0.0.1:8080/api/audits/$AID | jq '{status, score, findingsCount: (.findings | length)}'
```

Expected: `status: "completed"`, `score.overall` plus `score.byCategory` populated
for `seo`, `cwv`, `geo`, `a11y`, `content`, and `findingsCount > 0`.

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
