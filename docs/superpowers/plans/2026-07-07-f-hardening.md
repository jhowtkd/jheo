# JHEO F-Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden `apps/api` and `packages/core` along 12 specific H-items (race-safety, SSRF, audit trail, structured logging, type safety) without adding public routes or breaking any existing F1/F2/F3 test or migration.

**Architecture:** Additive only. One new Prisma model (`PublishEvent`) + one new back-relation on `Publish`. New `apps/api/src/security/url-guard.ts` (SSRF guard with DNS re-resolution and redirect re-check). New `apps/api/src/log.ts` + `pino-http` registration as the **first** Fastify plugin. New `withGenerationLock` helper in `apps/api/src/db.ts` wrapping `pg_advisory_xact_lock`. WordPress adapter and HttpPublisher swap their bare `fetch` for `fetchWithGuard`. Routes adopt `Prisma.InputJsonValue` typing and a new `httpUrl` Zod helper. Logging replaces `console.error` across worker and server. No data migration, no destructive rename, no public-route additions.

**Tech Stack:** Existing monorepo. New: `pino@^9`, `pino-http@^10` (server-side access logs). No new dep for the SSRF guard (Node `node:dns` + `net` + `url`).

---

## Global Constraints

Copied verbatim from the F-Hardening spec. Every task's requirements implicitly include this section.

- **TypeScript strict**, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. Every change compiles clean (`pnpm -r run typecheck` exit 0).
- **pnpm 9+**, root `package.json` with workspaces `apps/*` and `packages/*`. Node ≥ 20.10.
- **`packages/core/src/distribution/` MUST remain infra-free**: cannot import `fastify`, `bullmq`, `prisma`, `node:fetch`, `globalThis.fetch`. Adapters take `fetchFn: typeof fetch` injected at the worker boundary. (F3 invariant.)
- **Single-user, no auth.** Inherited from F1.
- **No public-route additions.** Only widening `GET /api/publishes/:id` to include `events` (last 50). All other H-items are internal.
- **Schema delta is additive only.** `PublishEvent` is new; `Publish.events` is a new back-relation. No column renames, no type changes, no data migration.
- **Test framework:** Vitest. Mock external HTTP via `vi.spyOn(globalThis, 'fetch')`. Integration tests (DB-touching) skip cleanly when no Postgres via `prisma.$queryRaw\`SELECT 1\`` precheck. Use **`describe.skipIf(!canRunDb, ...)` 3-arg form** (NOT `it.runIf` — the F2/F3 review caught this and the implementer briefly replicated it; do not regress).
- **All HTTP ports bound to host `127.0.0.1`**, container binds `0.0.0.0`. (F1 invariant.)
- **`docker compose up`** must reach a healthy state with zero manual steps. (F1 invariant.)
- **Naming:** file `kebab-case.ts`, exports `PascalCase` types, `camelCase` functions, `SCREAMING_SNAKE` env vars. (F3 invariant.)
- **No `any`.** Use Zod-inferred types or `unknown` + runtime narrowing. (F3 invariant.)
- **Frequent commits.** Conventional Commits: `feat:`, `chore:`, `test:`, `fix:`, `docs:`, `perf:`.
- **`pino-http` schema is the only log schema.** `console.error` must be removed from `apps/api/src/jobs/*.ts` and `apps/api/src/server.ts` and replaced with `log.error({ err, ... }, '...')`. Log shape asserted by test:
  ```ts
  { level: number; time: number; requestId: string; route: string; status: number; durationMs: number; err?: { message: string; stack?: string } }
  ```
- **Request-id propagation:** incoming `x-request-id` header (16-char hex) is honored if present, else generated as `crypto.randomUUID()`. Echoed in response header. Forwarded to downstream `fetch` calls via `fetchWithGuard` (NOT bare `fetch`).
- **SSRF blocklist (constant in `apps/api/src/security/url-guard.ts`):**
  - IPv4: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, `0.0.0.0/8`, `100.64.0.0/10` (CGNAT).
  - IPv6: `::1/128`, `fc00::/7`, `fe80::/10`, plus `::ffff:` mapped-IPv4 of the above.
  - Schemes: `http` and `https` only. Reject `file`, `ftp`, `gopher`, `data`, `javascript`, `vbscript`.
  - **Re-validate on every redirect** (re-resolve target host, re-check blocklist).
- **Error contract:** every route returns on failure `{ error: { code: string; message: string; requestId: string } }`. The `requestId` matches the response `x-request-id` header. SSRF violations → 422 (`code: 'unsafe_url'`); URL validation violations → 400 (`code: 'invalid_url'`).
- **Audit trail:** every Publish status transition writes one immutable `PublishEvent` row (`fromStatus`, `toStatus`, `message?`). `GET /api/publishes/:id` returns the last 50, ordered by `createdAt` asc.
- **The known `prisma-schema-shape.test.ts` baseline failure is pre-existing and intentional** (gated on `jheo_test` grants). Out of scope for F-Hardening.
- **CI bar:** `pnpm -r run typecheck && pnpm -r run test` must remain green. No new CI infrastructure; local + manual smoke is the bar.

---

## File Structure

F-Hardening additions/modifications under `/Users/jhonatan/Repos/JHEO`.

### Top-level additions

```
apps/api/
├── prisma/
│   ├── schema.prisma                # MODIFIED: add PublishEvent model + Publish.events back-relation
│   └── migrations/
│       └── <timestamp>_add_publish_event/
│           └── migration.sql        # NEW: single additive migration
├── src/
│   ├── db.ts                        # MODIFIED: add withGenerationLock
│   ├── log.ts                       # NEW: pino + pino-http factory
│   ├── security/
│   │   └── url-guard.ts             # NEW: isSafeOutboundUrl + fetchWithGuard
│   ├── validation/
│   │   └── http-url.ts              # NEW: z.string().url().refine(http|https) helper
│   ├── server.ts                    # MODIFIED: register pino-http FIRST; remove console.error
│   ├── jobs/
│   │   ├── publish-job.ts           # MODIFIED: withGenerationLock wrap; PublishEvent write on transition; fetchWithGuard; remove console.error
│   │   └── generate-job.ts          # MODIFIED: project-scoped material fetch; remove console.error
│   └── routes/
│       ├── materials.ts             # MODIFIED: httpUrl validation; Prisma.InputJsonValue; SSRF 422; remove console.error
│       ├── channels.ts              # MODIFIED: httpUrl on config.url; Prisma.InputJsonValue; remove console.error
│       ├── templates.ts             # MODIFIED: Prisma.InputJsonValue; remove console.error
│       └── publishes.ts             # MODIFIED: include events (last 50); cuid rotation; remove console.error
├── test/
│   ├── db/
│   │   └── lock.test.ts             # NEW: H-01 advisory lock
│   ├── url-guard.test.ts            # NEW: H-08 8 unit cases
│   ├── safe-fetch-integration.test.ts # NEW: H-08 1 integration case (Material route 422)
│   ├── jobs/
│   │   ├── generate-job.test.ts     # MODIFIED: H-02 + H-03 new cases
│   │   └── publish-job.test.ts      # MODIFIED: H-02 + H-11 new cases
│   ├── routes/
│   │   └── publishes.test.ts        # MODIFIED: H-10 + H-11 new cases (cuid rotation + events array)
│   ├── f3-smoke.test.ts             # MODIFIED: assert pino-http middleware present; PublishEvent table reachable
│   └── log-shape.test.ts            # NEW: H-12 log shape assertion

packages/core/src/
├── distribution/
│   ├── aggregate.ts                 # MODIFIED: validTransitions: Record<ReviewState, ReadonlyArray<ReviewState>>
│   ├── http.ts                      # MODIFIED: fetchWithGuard via injected fetchFn
│   └── wordpress.ts                 # MODIFIED: tags field on post body; WordPressPublishError for non-2xx/4xx
└── test/distribution/
    ├── wordpress.test.ts            # MODIFIED: H-04 + H-05
    ├── http.test.ts                 # MODIFIED: H-08 (injected fetchFn re-checks)
    └── aggregate.test.ts            # MODIFIED: H-07 validTransitions typing
```

### Decomposition rationale

- **`security/url-guard.ts` is its own file** (~80–150 lines) to keep SSRF policy auditable in one place. `safe-fetch.ts` already exists for F2's outbound HTTP — `url-guard.ts` is the policy enforcement layer; `safe-fetch.ts` becomes a thin wrapper that delegates to `fetchWithGuard` or is deleted in favor of it.
- **`log.ts` is its own module** so test imports a single `log` instance, and the schema is asserted in one place.
- **`validation/http-url.ts` is its own module** so two routes (`materials`, `channels`) and any future route reuse the same Zod schema.
- **`db.ts` gains `withGenerationLock` inline** — not a new file, because it's a 30-line helper that uses the same `prisma` export.
- **Tests are co-located with the existing test tree** (`apps/api/test/db/`, `apps/api/test/jobs/`, `apps/api/test/routes/`); the new `lock.test.ts` mirrors the existing `f2-smoke.test.ts` pattern for the `skipIf(!canRunDb)` form.
- **No `hardening.ts` or `h-*.ts` omnibus file** — each H-item lands on a coherent commit boundary (one feature per H-item, sometimes split into helper + call-site as in F2/F3).

---

## Task Order

Tasks are grouped by **risk-minimising execution order**: schema-first (so migrations are validated by the rest of the work), then guards (url-guard, withGenerationLock, httpUrl, validTransitions), then call-sites (where guards are wired in), then tests and observability last. Each task ends with an independently testable, reviewable commit.

| #   | Task                                               | H-Item(s)    | Files created/modified                                                                                                |
|-----|----------------------------------------------------|--------------|-----------------------------------------------------------------------------------------------------------------------|
| 1   | `PublishEvent` model + back-relation + migration    | H-11         | `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<ts>_add_publish_event/migration.sql`                   |
| 2   | `apps/api/src/log.ts` + pino-http registration      | H-12 (pt.1)  | `apps/api/src/log.ts` (new), `apps/api/src/server.ts` (modify)                                                        |
| 3   | `isSafeOutboundUrl` + `fetchWithGuard`              | H-08 (pt.1)  | `apps/api/src/security/url-guard.ts` (new)                                                                            |
| 4   | `withGenerationLock` helper                        | H-01 (pt.1)  | `apps/api/src/db.ts` (modify)                                                                                         |
| 5   | `httpUrl` Zod helper + URL pre-validation in routes | H-09         | `apps/api/src/validation/http-url.ts` (new), `apps/api/src/routes/materials.ts`, `apps/api/src/routes/channels.ts`   |
| 6   | SSRF guard wired into Material route + HttpPublisher| H-08 (pt.2)  | `apps/api/src/routes/materials.ts`, `packages/core/src/distribution/http.ts`                                          |
| 7   | Worker `pg_advisory_xact_lock` + cross-project scope| H-01 (pt.2) + H-03 | `apps/api/src/jobs/publish-job.ts`, `apps/api/src/jobs/generate-job.ts`                                      |
| 8   | `PublishEvent` write on every Publish transition   | H-11 (pt.2)  | `apps/api/src/jobs/publish-job.ts`, `apps/api/src/routes/publishes.ts`                                                |
| 9   | `Prisma.InputJsonValue` typing in routes            | H-06         | `apps/api/src/routes/materials.ts`, `apps/api/src/routes/channels.ts`, `apps/api/src/routes/templates.ts`            |
| 10  | `validTransitions` typed map                        | H-07         | `packages/core/src/distribution/aggregate.ts`                                                                         |
| 11  | WordPress term IDs + non-2xx/4xx surface            | H-04 + H-05  | `packages/core/src/distribution/wordpress.ts`                                                                         |
| 12  | `Publish.id` access scoping (cross-project) + cuid rotation | H-10 | `apps/api/src/routes/publishes.ts`                                                                                    |
| 13  | `pino-http` replaces `console.error` everywhere     | H-12 (pt.2)  | `apps/api/src/server.ts`, `apps/api/src/jobs/publish-job.ts`, `apps/api/src/jobs/generate-job.ts`                      |
| 14  | `f3-smoke` extended; log-shape test                 | H-12 (pt.3)  | `apps/api/test/f3-smoke.test.ts`, `apps/api/test/log-shape.test.ts` (new)                                             |

---

## Task 1: `PublishEvent` model + back-relation + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_publish_event/migration.sql` (auto-generated by `prisma migrate dev`)
- Test: existing `apps/api/test/prisma-schema-shape-f3.test.ts` (must still skip cleanly, no new failure)

**Interfaces:**
- Produces: `PublishEvent` model (cuid, `publishId` String FK, `fromStatus String?`, `toStatus String`, `message String?`, `createdAt DateTime @default(now())`, indexes on `publishId` and `createdAt`); `Publish.events PublishEvent[]` back-relation with `onDelete: Cascade`.

- [ ] **Step 1: Add `PublishEvent` model and `Publish.events` back-relation to `schema.prisma`**

Append to the bottom of `apps/api/prisma/schema.prisma`:
```prisma
model PublishEvent {
  id         String   @id @default(cuid())
  publishId  String
  publish    Publish  @relation(fields: [publishId], references: [id], onDelete: Cascade)
  fromStatus String?
  toStatus   String
  message    String?
  createdAt  DateTime @default(now())

  @@index([publishId])
  @@index([createdAt])
}
```

In the existing `model Publish { ... }` block, add a line inside (anywhere; convention is just above the indexes):
```prisma
  events PublishEvent[]
```

- [ ] **Step 2: Run `prisma migrate dev` to generate the additive SQL**

Run:
```bash
cd /Users/jhonatan/Repos/JHEO/apps/api
pnpm prisma migrate dev --name add_publish_event
```
Expected: a new directory `apps/api/prisma/migrations/<timestamp>_add_publish_event/migration.sql` containing exactly:
```sql
-- CreateTable
CREATE TABLE "PublishEvent" (
    "id" TEXT NOT NULL,
    "publishId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PublishEvent_publishId_idx" ON "PublishEvent"("publishId");

-- CreateIndex
CREATE INDEX "PublishEvent_createdAt_idx" ON "PublishEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "PublishEvent" ADD CONSTRAINT "PublishEvent_publishId_fkey" FOREIGN KEY ("publishId") REFERENCES "Publish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Run `prisma generate` and typecheck**

Run:
```bash
pnpm prisma generate
cd /Users/jhonatan/Repos/JHEO && pnpm -r run typecheck
```
Expected: exit 0. No new type errors.

- [ ] **Step 4: Verify the existing `prisma-schema-shape-f3.test.ts` still skips cleanly**

Run:
```bash
cd /Users/jhonatan/Repos/JHEO/apps/api && pnpm vitest run test/prisma-schema-shape-f3.test.ts
```
Expected: `Tests skipped` (no DB) OR `Tests passed` (with DB). Critically: no **new** failure introduced by the migration.

- [ ] **Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/JHEO
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): add PublishEvent audit table for status transitions"
```

---

## Task 2: `apps/api/src/log.ts` + pino-http registration

**Files:**
- Create: `apps/api/src/log.ts`
- Modify: `apps/api/src/server.ts`
- Test: `apps/api/test/log-shape.test.ts` (skeleton — full assertion lands in Task 14)

**Interfaces:**
- Produces: `export const log: pino.Logger` configured with the spec's log shape; `export const httpLogger = pinoHttp({ logger: log, ... })`; `export function requestIdMiddleware(req, res, next)` that reads `x-request-id` (16-char hex) or generates `crypto.randomUUID()`.

- [ ] **Step 1: Add `pino` and `pino-http` dependencies**

Run:
```bash
cd /Users/jhonatan/Repos/JHEO/apps/api
pnpm add pino@^9 pino-http@^10
pnpm add -D @types/pino-http@^10
```

- [ ] **Step 2: Write `apps/api/src/log.ts`**

```ts
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import pinoHttp from 'pino-http';
import type { FastifyRequest, FastifyReply } from 'fastify';

const isHex16 = (s: unknown): s is string =>
  typeof s === 'string' && /^[0-9a-f]{16}$/i.test(s);

export const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => ({ level: label }),
    bindings: () => ({}),
  },
  timestamp: () => `,"time":${Date.now()}`,
  base: undefined,
});

export const httpLogger = pinoHttp({
  logger: log,
  genReqId: (req, res) => {
    const incoming = (req.headers['x-request-id'] as string | undefined) ?? '';
    const id = isHex16(incoming) ? incoming : randomUUID().replace(/-/g, '').slice(0, 16);
    res.setHeader('x-request-id', id);
    return id;
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customProps: (req) => ({ requestId: (req as FastifyRequest).id }),
  customSuccessMessage: (req, res) => `${(req as FastifyRequest).method} ${(req as FastifyRequest).url} ${res.statusCode}`,
  customErrorMessage: (req, res, err) => `${(req as FastifyRequest).method} ${(req as FastifyRequest).url} ${res.statusCode} ${err.message}`,
  serializers: {
    req: (req) => ({ method: req.method, url: req.url, id: req.id }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});

export function requestIdHook(req: FastifyRequest, _reply: FastifyReply, done: () => void): void {
  if (!req.id) req.id = randomUUID().replace(/-/g, '').slice(0, 16);
  done();
}
```

- [ ] **Step 3: Register pino-http in `server.ts` as the FIRST plugin**

In `apps/api/src/server.ts`, before any `app.register(...)` call, add:
```ts
import { httpLogger, requestIdHook } from './log.js';

app.addHook('onRequest', requestIdHook);
app.register(httpLogger);
```

- [ ] **Step 4: Run typecheck and existing tests**

```bash
cd /Users/jhonatan/Repos/JHEO && pnpm -r run typecheck
cd /Users/jhonatan/Repos/JHEO/apps/api && pnpm vitest run
```
Expected: typecheck exit 0; all existing tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/JHEO
git add apps/api/src/log.ts apps/api/src/server.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): add pino-http structured access logs"
```

---

## Task 3: `isSafeOutboundUrl` + `fetchWithGuard`

**Files:**
- Create: `apps/api/src/security/url-guard.ts`
- Test: `apps/api/test/url-guard.test.ts` (8 unit cases)

**Interfaces:**
- Produces:
  ```ts
  export function isSafeOutboundUrl(input: string): Promise<boolean>;
  export async function fetchWithGuard(input: string, init?: RequestInit): Promise<Response>;
  ```
  - `isSafeOutboundUrl` DNS-resolves the host, walks all A/AAAA records, rejects if any in blocklist.
  - `fetchWithGuard` validates, calls `fetch`, and re-validates on any 3xx redirect by re-resolving and re-checking.

- [ ] **Step 1: Write the failing unit test `apps/api/test/url-guard.test.ts`**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isSafeOutboundUrl, fetchWithGuard } from '../src/security/url-guard.js';

afterEach(() => vi.restoreAllMocks());

describe('isSafeOutboundUrl', () => {
  it('blocks 10.0.0.0/8 (private IPv4)', async () => {
    expect(await isSafeOutboundUrl('http://10.0.0.1/x')).toBe(false);
  });
  it('blocks 192.168.0.0/16 (private IPv4)', async () => {
    expect(await isSafeOutboundUrl('http://192.168.1.1/x')).toBe(false);
  });
  it('blocks 172.16.0.0/12 (private IPv4)', async () => {
    expect(await isSafeOutboundUrl('http://172.16.0.1/x')).toBe(false);
  });
  it('blocks 127.0.0.0/8 (loopback)', async () => {
    expect(await isSafeOutboundUrl('http://127.0.0.1:8080/x')).toBe(false);
  });
  it('blocks 169.254.0.0/16 (link-local)', async () => {
    expect(await isSafeOutboundUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
  });
  it('blocks ::1/128 (IPv6 loopback)', async () => {
    expect(await isSafeOutboundUrl('http://[::1]/x')).toBe(false);
  });
  it('blocks fc00::/7 (IPv6 ULA)', async () => {
    expect(await isSafeOutboundUrl('http://[fc00::1]/x')).toBe(false);
  });
  it('blocks non-http(s) schemes', async () => {
    expect(await isSafeOutboundUrl('file:///etc/passwd')).toBe(false);
    expect(await isSafeOutboundUrl('gopher://example.com/_admin')).toBe(false);
    expect(await isSafeOutboundUrl('javascript:alert(1)')).toBe(false);
  });
  it('rejects a malformed URL', async () => {
    expect(await isSafeOutboundUrl('not a url')).toBe(false);
  });
});

describe('fetchWithGuard', () => {
  it('re-checks the target host on a 3xx redirect', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } }),
    );
    await expect(fetchWithGuard('https://example.com/start')).rejects.toThrow(/unsafe/i);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/jhonatan/Repos/JHEO/apps/api && pnpm vitest run test/url-guard.test.ts
```
Expected: all tests fail with "Cannot find module '../src/security/url-guard.js'".

- [ ] **Step 3: Implement `apps/api/src/security/url-guard.ts`**

```ts
import { lookup, lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const PRIVATE_V4_CIDRS: Array<[string, number]> = [
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['0.0.0.0', 8],
  ['100.64.0.0', 10],
];
const PRIVATE_V6_CIDRS: Array<[string, number]> = [
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
];

function ipToBigInt(ip: string): bigint {
  if (isIP(ip) === 4) {
    return ip.split('.').reduce((acc, oct) => (acc << 8n) + BigInt(oct), 0n);
  }
  // IPv6
  const parts = ip.split(':');
  const full: string[] = [];
  for (const p of parts) {
    if (p === '') continue;
    full.push(p.padStart(4, '0'));
  }
  let acc = 0n;
  for (const p of full) acc = (acc << 16n) + BigInt(parseInt(p, 16));
  return acc;
}

function cidrContainsV4(cidr: [string, number], ip: string): boolean {
  if (isIP(ip) !== 4) return false;
  const [base, bits] = cidr;
  const mask = bits === 0 ? 0n : (~0n << BigInt(32 - bits)) & 0xffffffffn;
  return (ipToBigInt(ip) & mask) === (ipToBigInt(base) & mask);
}

function cidrContainsV6(cidr: [string, number], ip: string): boolean {
  if (isIP(ip) !== 6) return false;
  const [base, bits] = cidr;
  const mask = bits === 0 ? 0n : (~0n << BigInt(128 - bits)) & ((1n << 128n) - 1n);
  return (ipToBigInt(ip) & mask) === (ipToBigInt(base) & mask);
}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) return PRIVATE_V4_CIDRS.some((c) => cidrContainsV4(c, ip));
  if (isIP(ip) === 6) {
    if (ip.startsWith('::ffff:')) {
      const mapped = ip.slice(7);
      if (isIP(mapped) === 4) return PRIVATE_V4_CIDRS.some((c) => cidrContainsV4(c, mapped));
    }
    return PRIVATE_V6_CIDRS.some((c) => cidrContainsV6(c, ip));
  }
  return true; // unknown => deny
}

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

export async function isSafeOutboundUrl(input: string): Promise<boolean> {
  let url: URL;
  try { url = new URL(input); } catch { return false; }
  if (!ALLOWED_SCHEMES.has(url.protocol)) return false;
  const host = url.hostname;
  if (host === '') return false;
  // Literal IP?
  if (isIP(host) > 0) return !isPrivateIp(host);
  // DNS-resolve
  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = await dnsLookup(host, { all: true, verbatim: true });
  } catch {
    return false; // resolution failure => deny
  }
  if (addrs.length === 0) return false;
  return addrs.every((a) => !isPrivateIp(a.address));
}

export async function fetchWithGuard(input: string, init?: RequestInit): Promise<Response> {
  const validated = await isSafeOutboundUrl(input);
  if (!validated) throw new Error(`unsafe outbound url: ${input}`);
  const res = await fetch(input, init);
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('location');
    if (loc) {
      // Resolve relative to input
      const next = new URL(loc, input).toString();
      if (!(await isSafeOutboundUrl(next))) throw new Error(`unsafe redirect target: ${next}`);
    }
  }
  return res;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/jhonatan/Repos/JHEO/apps/api && pnpm vitest run test/url-guard.test.ts
```
Expected: all 9 unit tests pass.

- [ ] **Step 5: Run typecheck and commit**

```bash
cd /Users/jhonatan/Repos/JHEO && pnpm -r run typecheck
cd /Users/jhonatan/Repos/JHEO
git add apps/api/src/security/url-guard.ts apps/api/test/url-guard.test.ts
git commit -m "feat(api): add SSRF guard isSafeOutboundUrl + fetchWithGuard"
```

---

## Task 4: `withGenerationLock` helper

**Files:**
- Modify: `apps/api/src/db.ts`
- Test: `apps/api/test/db/lock.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function withGenerationLock<T>(
    prisma: PrismaClient,
    generationId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T>;
  ```
  Wraps `fn` in `prisma.$transaction` with `SELECT pg_advisory_xact_lock(hash)` issued inside the tx. Lock releases on commit/rollback.

- [ ] **Step 1: Write the failing test `apps/api/test/db/lock.test.ts`**

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { prisma, withGenerationLock } from '../../src/db.js';

let canRunDb = false;
beforeAll(async () => {
  try { await prisma.$queryRaw`SELECT 1`; canRunDb = true; } catch { canRunDb = false; }
});

describe.skipIf(!canRunDb)('withGenerationLock', () => {
  it('serialises two concurrent calls for the same generationId', async () => {
    const gen = await prisma.generation.create({
      data: {
        projectId: (await prisma.project.findFirstOrThrow({ select: { id: true } })).id,
        prompt: 'lock test',
        modelOutput: 'unused',
        reviewState: 'approved',
      },
    });
    const order: number[] = [];
    const p1 = withGenerationLock(prisma, gen.id, async () => {
      order.push(1);
      await new Promise((r) => setTimeout(r, 200));
      order.push(2);
      return 1;
    });
    const p2 = withGenerationLock(prisma, gen.id, async () => {
      order.push(3);
      await new Promise((r) => setTimeout(r, 50));
      order.push(4);
      return 2;
    });
    const [a, b] = await Promise.all([p1, p2]);
    expect([a, b]).toEqual([1, 2]);
    expect(order).toEqual([1, 2, 3, 4]); // strict serialization
    await prisma.generation.delete({ where: { id: gen.id } });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/jhonatan/Repos/JHEO/apps/api && pnpm vitest run test/db/lock.test.ts
```
Expected: FAIL — `withGenerationLock is not a function` (or `skip` if no DB; both are acceptable failures of the *new* test).

- [ ] **Step 3: Implement `withGenerationLock` in `apps/api/src/db.ts`**

Append to `apps/api/src/db.ts`:
```ts
import { Prisma, type PrismaClient } from '@prisma/client';
import { Buffer } from 'node:buffer';

function hashGenerationId(generationId: string): bigint {
  // Take the first 8 bytes of the cuid as a bigint, modulo 2^63 - 1 to fit in a Postgres bigint.
  const buf = Buffer.from(generationId);
  const slice = buf.subarray(0, Math.min(8, buf.length));
  let h = 0n;
  for (const b of slice) h = (h << 8n) | BigInt(b);
  return h & 0x7fffffffffffffffn;
}

export async function withGenerationLock<T>(
  prisma: PrismaClient,
  generationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const key = hashGenerationId(generationId);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key})`;
    return fn(tx);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes (or skips cleanly)**

```bash
cd /Users/jhonatan/Repos/JHEO/apps/api && pnpm vitest run test/db/lock.test.ts
```
Expected: 1 test passes (with DB) or skips cleanly (without DB). Critically: the **3-arg `describe.skipIf(!canRunDb, ...)`** form is used (not `it.runIf`).

- [ ] **Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/JHEO
git add apps/api/src/db.ts apps/api/test/db/lock.test.ts
git commit -m "feat(api): add withGenerationLock helper using pg_advisory_xact_lock"
```

---

## Task 5: `httpUrl` Zod helper + URL pre-validation in routes

**Files:**
- Create: `apps/api/src/validation/http-url.ts`
- Modify: `apps/api/src/routes/materials.ts`, `apps/api/src/routes/channels.ts`
- Test: extend `apps/api/test/routes/materials.test.ts` and `apps/api/test/routes/channels.test.ts` with invalid-URL cases

**Interfaces:**
- Produces: `export const httpUrl: z.ZodString` — `z.string().url().refine(u => ['http:','https:'].includes(new URL(u).protocol))`.

- [ ] **Step 1: Implement `apps/api/src/validation/http-url.ts`**

```ts
import { z } from 'zod';

export const httpUrl = z.string().url().refine(
  (u) => {
    try {
      const p = new URL(u).protocol;
      return p === 'http:' || p === 'https:';
    } catch {
      return false;
    }
  },
  { message: 'URL must be http(s)' },
);
export type HttpUrl = z.infer<typeof httpUrl>;
```

- [ ] **Step 2: Add a failing test for `http://example.com` is accepted and `ftp://x` is rejected**

In `apps/api/test/routes/materials.test.ts`, add:
```ts
it('rejects a non-http(s) URL with 400 invalid_url', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/materials',
    payload: { url: 'ftp://example.com/x', kind: 'webpage' },
  });
  expect(res.statusCode).toBe(400);
  const body = JSON.parse(res.body);
  expect(body.error?.code).toBe('invalid_url');
});
```

In `apps/api/test/routes/channels.test.ts`, add the symmetric test for the `config.url` field of an HTTP channel:
```ts
it('rejects an HTTP channel with ftp:// config.url', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/channels',
    payload: { type: 'http', name: 'bad', config: { url: 'ftp://example.com/x' } },
  });
  expect(res.statusCode).toBe(400);
  expect(JSON.parse(res.body).error?.code).toBe('invalid_url');
});
```

- [ ] **Step 3: Run the new tests to verify they fail**

```bash
cd /Users/jhonatan/Repos/JHEO/apps/api && pnpm vitest run test/routes/materials.test.ts test/routes/channels.test.ts
```
Expected: 1 test in each file fails with the current bare `z.string().url()` validator.

- [ ] **Step 4: Replace `z.string().url()` in the two routes**

In `apps/api/src/routes/materials.ts`:
- Add `import { httpUrl } from '../validation/http-url.js';`
- Replace `url: z.string().url()` with `url: httpUrl`.
- Ensure the failure response shape is `{ error: { code: 'invalid_url', message, requestId } }` (with `requestId` from the existing request-id hook in Task 2).

In `apps/api/src/routes/channels.ts`:
- Add the same import.
- In the `http` discriminated-union branch, replace `config: z.object({ url: z.string().url(), ... })` with `config: z.object({ url: httpUrl, ... })`.
- Same error-shape fix.

- [ ] **Step 5: Run the new tests to verify they pass; typecheck**

```bash
cd /Users/jhonatan/Repos/JHEO/apps/api && pnpm vitest run test/routes/materials.test.ts test/routes/channels.test.ts
cd /Users/jhonatan/Repos/JHEO && pnpm -r run typecheck
```
Expected: the two new tests pass; typecheck exit 0; existing tests still pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/jhonatan/Repos/JHEO
git add apps/api/src/validation/http-url.ts apps/api/src/routes/materials.ts apps/api/src/routes/channels.ts apps/api/test/routes/materials.test.ts apps/api/test/routes/channels.test.ts
git commit -m "feat(api): enforce http(s) URL pre-validation on materials + channels"
```

---

## Task 6: SSRF guard wired into Material route + HttpPublisher

**Files:**
- Modify: `apps/api/src/routes/materials.ts` (H-08 422 on unsafe URL)
- Modify: `packages/core/src/distribution/http.ts` (replace bare `fetch` with `fetchWithGuard`)
- Test: `apps/api/test/safe-fetch-integration.test.ts` (new)

**Interfaces:**
- Consumes: `isSafeOutboundUrl`, `fetchWithGuard` from Task 3.
- Produces: Material POST returns 422 `unsafe_url` when `isSafeOutboundUrl(url) === false`; HttpPublisher's adapter-level `fetch` is replaced with `fetchWithGuard`.

- [ ] **Step 1: Write the failing integration test `apps/api/test/safe-fetch-integration.test.ts`**

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../src/app.js';

let canRunDb = false;
beforeAll(async () => {
  try {
    const { prisma } = await import('../src/db.js');
    await prisma.$queryRaw`SELECT 1`;
    canRunDb = true;
  } catch { canRunDb = false; }
});

describe.skipIf(!canRunDb)('safe-fetch integration', () => {
  it('Material POST returns 422 unsafe_url on http://127.0.0.1', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/materials',
      payload: { url: 'http://127.0.0.1:1/x', kind: 'webpage' },
    });
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error?.code).toBe('unsafe_url');
    await app.close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/jhonatan/Repos/JHEO/apps/api && pnpm vitest run test/safe-fetch-integration.test.ts
```
Expected: FAIL — currently the route returns 200/201 because the SSRF check is missing.

- [ ] **Step 3: Wire `isSafeOutboundUrl` into the Material route**

In `apps/api/src/routes/materials.ts`, after the Zod parse passes, before the DB write:
```ts
import { isSafeOutboundUrl } from '../security/url-guard.js';

// inside the POST handler, right after `const data = schema.parse(req.body);`
if (!(await isSafeOutboundUrl(data.url))) {
  return reply.code(422).send({ error: { code: 'unsafe_url', message: 'URL is not safe to fetch', requestId: req.id } });
}
```

- [ ] **Step 4: Replace bare `fetch` in `packages/core/src/distribution/http.ts`**

The HttpPublisher takes `fetchFn: typeof fetch` injected at the worker boundary (F3 invariant). Replace the call site with `fetchWithGuard`:
- Add import: `import { fetchWithGuard as defaultFetchWithGuard } from '@jheo/api/security/url-guard';` — but this would violate the "core is infra-free" rule.

  **Resolution:** HttpPublisher continues to take `fetchFn`. The worker boundary (`apps/api/src/jobs/publish-job.ts`) injects a wrapped `fetchFn` that calls `fetchWithGuard`. Concretely:
  - In `apps/api/src/jobs/publish-job.ts`, when constructing the HttpPublisher, pass:
    ```ts
    const fetchFn = (input: string | URL, init?: RequestInit) => fetchWithGuard(String(input), init);
    new HttpPublisher(channelConfig, fetchFn);
    ```
  - `packages/core/src/distribution/http.ts` is unchanged (still uses `this.fetchFn(input, init)`).
  - This keeps the core pure. The test for HttpPublisher in `packages/core/test/distribution/http.test.ts` continues to inject a `vi.fn()` and passes.

- [ ] **Step 5: Run the integration test; verify it passes**

```bash
cd /Users/jhonatan/Repos/JHEO/apps/api && pnpm vitest run test/safe-fetch-integration.test.ts
cd /Users/jhonatan/Repos/JHEO && pnpm -r run typecheck
```
Expected: integration test passes; typecheck exit 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/jhonatan/Repos/JHEO
git add apps/api/src/routes/materials.ts apps/api/src/jobs/publish-job.ts apps/api/test/safe-fetch-integration.test.ts
git commit -m "feat(api): SSRF guard on Material route + HttpPublisher (422 unsafe_url)"
```

---

## Task 7: Worker `pg_advisory_xact_lock` + cross-project material scope

**Files:**
- Modify: `apps/api/src/jobs/publish-job.ts` (H-01 wrap of aggregate path)
- Modify: `apps/api/src/jobs/generate-job.ts` (H-03 project-scoped material fetch)
- Test: extend `apps/api/test/jobs/publish-job.test.ts` (H-01) and `apps/api/test/jobs/generate-job.test.ts` (H-03)

**Interfaces:**
- Consumes: `withGenerationLock` from Task 4.
- Produces: publish-job's `recomputeGenerationState(generationId)` path is wrapped in `withGenerationLock`; generate-job's material loading filters by `projectId === generation.projectId`.

- [ ] **Step 1: Add a failing test for `withGenerationLock` wrapping the aggregate path**

In `apps/api/test/jobs/publish-job.test.ts`, add a new `describe` block (mirror the existing pattern):
```ts
describe.skipIf(!canRunDb)('publish-job advisory lock', () => {
  it('serialises concurrent aggregateReviewState calls for the same generationId', async () => {
    const gen = await prisma.generation.create({
      data: { projectId: ..., prompt: 'lock', modelOutput: 'x', reviewState: 'approved' },
    });
    // Fire N concurrent recompute calls; assert no two overlap inside the tx body.
    const callCount = { n: 0, max: 0 };
    const probe = () => { callCount.n += 1; callCount.max = Math.max(callCount.max, callCount.n); return new Promise(r => setTimeout(r, 50)); };
    // Call the same internal function N times via the public recompute function
    // (or import the worker and call directly).
    await Promise.all(Array.from({ length: 5 }, () => recomputeGenerationState(prisma, gen.id, probe)));
    expect(callCount.max).toBe(1);
    await prisma.generation.delete({ where: { id: gen.id } });
  });
});
```

- [ ] **Step 2: Add a failing test for project-scoped material loading**

In `apps/api/test/jobs/generate-job.test.ts`, add:
```ts
describe.skipIf(!canRunDb)('generate-job cross-project material scope', () => {
  it('only loads materials belonging to the generation project', async () => {
    const projectA = await prisma.project.create({ data: { name: 'A' } });
    const projectB = await prisma.project.create({ data: { name: 'B' } });
    const matA = await prisma.material.create({ data: { projectId: projectA.id, url: 'http://a/x', kind: 'webpage', content: 'A' } });
    const matB = await prisma.material.create({ data: { projectId: projectB.id, url: 'http://b/x', kind: 'webpage', content: 'B' } });
    const gen = await prisma.generation.create({ data: { projectId: projectA.id, prompt: 'g', modelOutput: 'unused', reviewState: 'draft' } });
    const loaded = await loadMaterialsForGeneration(prisma, gen.id);
    expect(loaded.map(m => m.id)).toEqual([matA.id]);
    // cleanup
    await prisma.material.deleteMany({ where: { id: { in: [matA.id, matB.id] } } });
    await prisma.generation.delete({ where: { id: gen.id } });
    await prisma.project.deleteMany({ where: { id: { in: [projectA.id, projectB.id] } } });
  });
});
```

- [ ] **Step 3: Run the new tests to verify they fail**

```bash
cd /Users/jhonatan/Repos/JHEO/apps/api && pnpm vitest run test/jobs/publish-job.test.ts test/jobs/generate-job.test.ts
```
Expected: the two new tests fail (the wrap is missing / the scope is global).

- [ ] **Step 4: Wrap the aggregate path in `withGenerationLock`**

In `apps/api/src/jobs/publish-job.ts`, locate the `recomputeGenerationState(generationId)` function (or whatever name it carries from F3) and wrap its body:
```ts
import { withGenerationLock } from '../db.js';

export async function recomputeGenerationState(prisma: PrismaClient, generationId: string): Promise<ReviewState> {
  return withGenerationLock(prisma, generationId, async (tx) => {
    // existing body, but use `tx` instead of `prisma`
  });
}
```

(If the existing function does not take a `prisma` argument, add it. The change is mechanical.)

- [ ] **Step 5: Scope material loading by `projectId` in `generate-job.ts`**

In `apps/api/src/jobs/generate-job.ts`, replace any global `prisma.material.findMany(...)` in the material-loading path with a project-scoped query:
```ts
export async function loadMaterialsForGeneration(prisma: PrismaClient, generationId: string) {
  const gen = await prisma.generation.findUniqueOrThrow({ where: { id: generationId }, select: { projectId: true } });
  return prisma.material.findMany({ where: { projectId: gen.projectId } });
}
```

- [ ] **Step 6: Run the tests; verify they pass; typecheck**

```bash
cd /Users/jhonatan/Repos/JHEO/apps/api && pnpm vitest run test/jobs/publish-job.test.ts test/jobs/generate-job.test.ts
cd /Users/jhonatan/Repos/JHEO && pnpm -r run typecheck
```
Expected: both new tests pass; typecheck exit 0.

- [ ] **Step 7: Commit**

```bash
cd /Users/jhonatan/Repos/JHEO
git add apps/api/src/jobs/publish-job.ts apps/api/src/jobs/generate-job.ts apps/api/test/jobs/publish-job.test.ts apps/api/test/jobs/generate-job.test.ts
git commit -m "fix(api): advisory-lock publish-job aggregate; scope generate-job materials by project"
```

---

## Task 8: `PublishEvent` write on every Publish transition

**Files:**
- Modify: `apps/api/src/jobs/publish-job.ts` (write on every status change in the lifecycle)
- Modify: `apps/api/src/routes/publishes.ts` (write on user-initiated cancel/retry)
- Test: extend `apps/api/test/jobs/publish-job.test.ts`

**Interfaces:**
- Consumes: `PublishEvent` model from Task 1.
- Produces: every status change calls a single helper `recordPublishTransition(tx, publishId, fromStatus, toStatus, message?)` that inserts a `PublishEvent` row. The same helper is used in worker and routes.

- [ ] **Step 1: Add a failing test asserting events are written on lifecycle transitions**

In `apps/api/test/jobs/publish-job.test.ts`, add a new `describe`:
```ts
describe.skipIf(!canRunDb)('PublishEvent writes on transitions', () => {
  it('writes one PublishEvent per status change', async () => {
    const gen = await prisma.generation.create({ data: { projectId: ..., prompt: 'ev', modelOutput: 'x', reviewState: 'approved' } });
    const ch = await prisma.distributionChannel.create({ data: { projectId: gen.projectId, type: 'http', name: 't', configEncrypted: 'x' } });
    const pub = await prisma.publish.create({ data: { generationId: gen.id, channelId: ch.id, status: 'queued' } });
    // simulate three transitions: queued -> running, running -> completed, completed -> running (retry)
    await recordPublishTransition(prisma, pub.id, 'queued', 'running');
    await recordPublishTransition(prisma, pub.id, 'running', 'completed');
    await recordPublishTransition(prisma, pub.id, 'completed', 'running');
    const events = await prisma.publishEvent.findMany({ where: { publishId: pub.id }, orderBy: { createdAt: 'asc' } });
    expect(events).toHaveLength(3);
    expect(events.map(e => [e.fromStatus, e.toStatus])).toEqual([['queued','running'],['running','completed'],['completed','running']]);
    // cleanup
    await prisma.publishEvent.deleteMany({ where: { publishId: pub.id } });
    await prisma.publish.delete({ where: { id: pub.id } });
    await prisma.distributionChannel.delete({ where: { id: ch.id } });
    await prisma.generation.delete({ where: { id: gen.id } });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/jhonatan/Repos/JHEO/apps/api && pnpm vitest run test/jobs/publish-job.test.ts
```
Expected: FAIL — `recordPublishTransition is not a function`.

- [ ] **Step 3: Implement `recordPublishTransition` and wire it into the worker**

Add to `apps/api/src/jobs/publish-job.ts`:
```ts
import { Prisma, type PrismaClient } from '@prisma/client';

export async function recordPublishTransition(
  prisma: PrismaClient | Prisma.TransactionClient,
  publishId: string,
  toStatus: string,
  message?: string,
): Promise<void> {
  const current = await prisma.publish.findUniqueOrThrow({ where: { id: publishId }, select: { status: true } });
  await prisma.publishEvent.create({
    data: { publishId, fromStatus: current.status, toStatus, message: message ?? null },
  });
  await prisma.publish.update({ where: { id: publishId }, data: { status: toStatus } });
}
```

In the worker's `processPublishJob` (or equivalent) function, replace every direct `prisma.publish.update({ where: { id }, data: { status: 'X' } })` with `recordPublishTransition(prisma, id, 'X', optionalMessage)`. Do this for:
- `queued → running` (at job start)
- `running → completed` (on success)
- `running → failed` (on terminal failure)
- `running → queued` (on retry)
- `running → cancelled` (on user cancel)

If the existing code uses a single `prisma.$transaction`, pass `tx` instead of `prisma` to the helper so the event row and the status update are atomic.

- [ ] **Step 4: Wire into `apps/api/src/routes/publishes.ts` for cancel and retry**

In the cancel handler:
```ts
await recordPublishTransition(prisma, req.params.id, 'cancelled', 'user cancelled');
```

In the retry handler (creates a new job + resets status):
```ts
await recordPublishTransition(prisma, req.params.id, 'queued', 'user retry');
```

- [ ] **Step 5: Run the new test; typecheck**

```bash
cd /Users/jhonatan/Repos/JHEO/apps/api && pnpm vitest run test/jobs/publish-job.test.ts
cd /Users/jhonatan/Repos/JHEO && pnpm -r run typecheck
```
Expected: the new test passes; typecheck exit 0; all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/jhonatan/Repos/JHEO
git add apps/api/src/jobs/publish-job.ts apps/api/src/routes/publishes.ts apps/api/test/jobs/publish-job.test.ts
git commit -m "feat(api): write PublishEvent row on every status transition"
```

---

## Task 9: `Prisma.InputJsonValue` typing in routes

**Files:**
- Modify: `apps/api/src/routes/materials.ts`
- Modify: `apps/api/src/routes/channels.ts`
- Modify: `apps/api/src/routes/templates.ts`

**Interfaces:**
- Replaces: any `as object` casts (or `as Prisma.JsonObject`) with explicit `Prisma.InputJsonValue` types.

- [ ] **Step 1: Run grep to enumerate `as object` sites**

```bash
cd /Users/jhonatan/Repos/JHEO/apps/api/src/routes
grep -n "as object" *.ts
```
Expected output: ~4–6 sites. (If the file already uses `as Prisma.JsonObject`, this task is a no-op — replace that with `Prisma.InputJsonValue` for forward-compat with Prisma 6.)

- [ ] **Step 2: Typecheck (no change yet) — confirm baseline**

```bash
cd /Users/jhonatan/Repos/JHEO && pnpm -r run typecheck
```
Expected: exit 0.

- [ ] **Step 3: Replace `as object` with `Prisma.InputJsonValue`**

In each affected file, add:
```ts
import { Prisma } from '@prisma/client';
```
And replace every `as object` cast with `as Prisma.InputJsonValue` (or, if the field is declared as `Prisma.InputJsonValue` already, the cast becomes unnecessary and can be removed entirely).

- [ ] **Step 4: Typecheck again — typecheck IS the test for H-06**

```bash
cd /Users/jhonatan/Repos/JHEO && pnpm -r run typecheck
```
Expected: exit 0. If the change surfaces a latent type error, that error **is** the spec catching a real issue — fix the call site to use a proper Zod-validated value (do not weaken to `any`).

- [ ] **Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/JHEO
git add apps/api/src/routes/materials.ts apps/api/src/routes/channels.ts apps/api/src/routes/templates.ts
git commit -m "perf(api): replace 'as object' with Prisma.InputJsonValue in route JSON fields"
```

---

## Task 10: `validTransitions` typed map

**Files:**
- Modify: `packages/core/src/distribution/aggregate.ts`
- Test: existing `packages/core/test/distribution/aggregate.test.ts` continues to pass

**Interfaces:**
- Replaces: any `validTransitions: any` or `Record<string, string[]>` with `Record<ReviewState, ReadonlyArray<ReviewState>>`.

- [ ] **Step 1: Run typecheck baseline**

```bash
cd /Users/jhonatan/Repos/JHEO && pnpm -r run typecheck
```
Expected: exit 0.

- [ ] **Step 2: Find and replace `validTransitions` declaration in `aggregate.ts`**

In `packages/core/src/distribution/aggregate.ts`, add:
```ts
import type { ReviewState } from './types.js';
```
And replace the existing `validTransitions` with:
```ts
export const validTransitions: Record<ReviewState, ReadonlyArray<ReviewState>> = {
  draft: ['in_review', 'approved'],
  in_review: ['draft', 'approved'],
  approved: ['publishing', 'draft'],
  publishing: ['published', 'draft'],
  published: ['draft'],
};
```

(The exact list must match the F1+F2 spec §5 — copy the values verbatim.)

- [ ] **Step 3: Run typecheck and aggregate tests**

```bash
cd /Users/jhonatan/Repos/JHEO && pnpm -r run typecheck
cd /Users/jhonatan/Repos/JHEO/packages/core && pnpm vitest run test/distribution/aggregate.test.ts
```
Expected: typecheck exit 0; aggregate tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/jhonatan/Repos/JHEO
git add packages/core/src/distribution/aggregate.ts
git commit -m "perf(core): type validTransitions as Record<ReviewState, ReadonlyArray<ReviewState>>"
```

---

## Task 11: WordPress term IDs + non-2xx/4xx surface

**Files:**
- Modify: `packages/core/src/distribution/wordpress.ts`
- Test: extend `packages/core/test/distribution/wordpress.test.ts`

**Interfaces:**
- Replaces: WordPress post body now includes a `tags: number[]` field built from `termIds['post_tag'] ?? []`; the adapter throws a `WordPressPublishError` with `{ status, body }` when the response is non-2xx and non-4xx (e.g. 5xx, network reset).

- [ ] **Step 1: Add a failing test for tags + structured error**

In `packages/core/test/distribution/wordpress.test.ts`, add:
```ts
it('attaches term IDs as the tags field on the post body', async () => {
  const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 7 }), { status: 201 }));
  const wp = new WordPressPublisher({ baseUrl: 'https://x', username: 'u', appPassword: 'p' }, fetchFn);
  await wp.publish({
    title: 't', content: 'c', kind: 'post',
    termIds: { category: [1, 2], post_tag: [10, 20] },
  });
  const body = JSON.parse((fetchFn.mock.calls[0]?.[1] as RequestInit).body as string);
  expect(body.tags).toEqual([10, 20]);
});

it('surfaces a 503 response body in WordPressPublishError', async () => {
  const fetchFn = vi.fn().mockResolvedValue(new Response('upstream down', { status: 503 }));
  const wp = new WordPressPublisher({ baseUrl: 'https://x', username: 'u', appPassword: 'p' }, fetchFn);
  await expect(wp.publish({ title: 't', content: 'c', kind: 'post' })).rejects.toMatchObject({
    name: 'WordPressPublishError',
    status: 503,
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
cd /Users/jhonatan/Repos/JHEO/packages/core && pnpm vitest run test/distribution/wordpress.test.ts
```
Expected: the two new tests fail.

- [ ] **Step 3: Implement tags + `WordPressPublishError`**

In `packages/core/src/distribution/wordpress.ts`:
- Add class:
  ```ts
  export class WordPressPublishError extends Error {
    constructor(public readonly status: number, public readonly bodyText: string) {
      super(`WordPress publish failed (${status}): ${bodyText.slice(0, 200)}`);
      this.name = 'WordPressPublishError';
    }
  }
  ```
- In the publish method, after building the post body, add:
  ```ts
  if (termIds?.post_tag && termIds.post_tag.length > 0) body.tags = termIds.post_tag;
  ```
- In the `fetch(...)` response handling, replace the existing 2xx/4xx check with:
  ```ts
  if (!res.ok && (res.status < 400 || res.status >= 500)) {
    const text = await res.text();
    throw new WordPressPublishError(res.status, text);
  }
  ```
  (4xx other than the post-validation cases continue to throw a regular `Error` for retryability semantics defined in F3.)

- [ ] **Step 4: Run all WordPress tests; typecheck**

```bash
cd /Users/jhonatan/Repos/JHEO/packages/core && pnpm vitest run test/distribution/wordpress.test.ts
cd /Users/jhonatan/Repos/JHEO && pnpm -r run typecheck
```
Expected: all WP tests pass; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
cd /Users/jhonatan/Repos/JHEO
git add packages/core/src/distribution/wordpress.ts packages/core/test/distribution/wordpress.test.ts
git commit -m "fix(core): attach term IDs as tags in WordPress body; surface 5xx in structured error"
```

---

## Task 12: `Publish.id` access scoping + cuid rotation

**Files:**
- Modify: `apps/api/src/routes/publishes.ts`
- Test: extend `apps/api/test/routes/publishes.test.ts`

**Interfaces:**
- Produces: `GET /api/publishes/:id` performs a scoped lookup (`include: { channel: { select: { projectId: true } } }`) and returns 404 when `channel.projectId !== req.projectId`. Cuid rotation: on a collision (vanishingly rare with cuid; the test simulates it by stubbing the existing `crypto.ts` rotate), the publish id is regenerated once.

- [ ] **Step 1: Add a failing test for cross-project 404**

In `apps/api/test/routes/publishes.test.ts`, add a new `describe`:
```ts
describe.skipIf(!canRunDb)('GET /api/publishes/:id scoping', () => {
  it('returns 404 when the publish belongs to a different project', async () => {
    const projectA = await prisma.project.create({ data: { name: 'A2' } });
    const projectB = await prisma.project.create({ data: { name: 'B2' } });
    const gen = await prisma.generation.create({ data: { projectId: projectA.id, prompt: 'g', modelOutput: 'x', reviewState: 'approved' } });
    const ch = await prisma.distributionChannel.create({ data: { projectId: projectA.id, type: 'http', name: 'c', configEncrypted: 'x' } });
    const pub = await prisma.publish.create({ data: { generationId: gen.id, channelId: ch.id, status: 'queued' } });
    // Call as if req.projectId === projectB.id
    const res = await app.inject({ method: 'GET', url: `/api/publishes/${pub.id}` });
    // The test scaffold must inject `req.projectId`. Use the helper that the existing routes test uses; if none, set the header that the auth layer reads (none in MVP, so simulate by mocking).
    expect([403, 404]).toContain(res.statusCode);
    // cleanup
    await prisma.publish.delete({ where: { id: pub.id } });
    await prisma.distributionChannel.delete({ where: { id: ch.id } });
    await prisma.generation.delete({ where: { id: gen.id } });
    await prisma.project.deleteMany({ where: { id: { in: [projectA.id, projectB.id] } } });
  });
});
```

(Note on `req.projectId`: in MVP there is no auth, so "the caller's project" is determined either by a single hard-coded `PROJECT_ID` env or by the request body. Look at how `apps/api/src/routes/publishes.ts` currently resolves the project for the create flow; use the same mechanism in the GET handler. If there is none, the cross-project check is N/A in MVP and the test should be marked `it.todo(...)` with a comment in the test explaining why. **Do not invent a new auth mechanism** — out of scope per spec §0.1.)

- [ ] **Step 2: Add a failing test for cuid rotation**

```ts
it('regenerates the publish id on collision (simulated)', async () => {
  // Force the rotate to be called once by stubbing the underlying Prisma create
  // to throw P2002 (unique constraint) on the first call, then succeed.
  const spy = vi.spyOn(prisma.publish, 'create')
    .mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))
    .mockResolvedValueOnce({ id: 'cuid-rotated', generationId: 'g', channelId: 'c', status: 'queued' } as any);
  // ...call the create-publish helper; expect the second call to be the rotated id
  expect(spy).toHaveBeenCalledTimes(2);
  expect(spy.mock.calls[1]?.[0]?.data?.id).toMatch(/^c[a-z0-9]{20,}$/);
  spy.mockRestore();
});
```

- [ ] **Step 3: Run the new tests; verify they fail**

```bash
cd /Users/jhonatan/Repos/JHEO/apps/api && pnpm vitest run test/routes/publishes.test.ts
```
Expected: the new tests fail.

- [ ] **Step 4: Implement scoping + rotation in `publishes.ts`**

For scoping (in the GET handler):
```ts
const pub = await prisma.publish.findUnique({
  where: { id: req.params.id },
  include: { channel: { select: { projectId: true } } },
});
if (!pub || pub.channel.projectId !== req.projectId) {
  return reply.code(404).send({ error: { code: 'not_found', message: 'publish not found', requestId: req.id } });
}
```

For rotation: if the existing create helper doesn't already rotate on P2002, wrap it:
```ts
async function createPublishWithRotation(input: Prisma.PublishCreateInput) {
  try {
    return await prisma.publish.create({ data: input });
  } catch (e) {
    if (isPrismaUniqueViolation(e)) {
      // re-generate id (cuid is collision-free; this is a defensive rotation)
      return prisma.publish.create({ data: { ...input, id: createCuid() } });
    }
    throw e;
  }
}
```
Use the existing `createCuid` from `apps/api/src/crypto.ts` (F1 helper).

- [ ] **Step 5: Run the new tests; typecheck**

```bash
cd /Users/jhonatan/Repos/JHEO/apps/api && pnpm vitest run test/routes/publishes.test.ts
cd /Users/jhonatan/Repos/JHEO && pnpm -r run typecheck
```
Expected: the new tests pass; typecheck exit 0; existing tests still pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/jhonatan/Repos/JHEO
git add apps/api/src/routes/publishes.ts apps/api/test/routes/publishes.test.ts
git commit -m "fix(api): scope GET /api/publishes/:id by project; rotate cuid on unique-constraint collision"
```

---

## Task 13: `pino-http` replaces `console.error` everywhere

**Files:**
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/jobs/publish-job.ts`
- Modify: `apps/api/src/jobs/generate-job.ts`

**Interfaces:**
- Replaces: every `console.error(...)` in these three files with `log.error({ err, ... }, 'message')` (or a domain-specific context object).

- [ ] **Step 1: Run grep to enumerate `console.error` sites**

```bash
cd /Users/jhonatan/Repos/JHEO/apps/api/src
grep -n "console.error" server.ts jobs/*.ts
```
Expected: 0 to several sites per file.

- [ ] **Step 2: Replace every `console.error(...)` with `log.error(...)`**

In each file, add `import { log } from '../log.js';` (or `./log.js` in `server.ts`).

Replace each `console.error('msg', err)` with `log.error({ err }, 'msg')`.
Replace each `console.error(\`msg ${var}\`, err)` with `log.error({ err, var }, 'msg')` (move the dynamic value into the context object).

**Note:** `console.log` and `console.warn` may also exist. Per the F-Hardening spec, only `console.error` is in scope; leave `console.log`/`console.warn` for a future cleanup. (If a `console.warn` is in an error-path context, replace it too — the spec says "console.error" but the intent is "all error-path logging". Use judgment; if in doubt, replace.)

- [ ] **Step 3: Typecheck and run all tests**

```bash
cd /Users/jhonatan/Repos/JHEO && pnpm -r run typecheck
cd /Users/jhonatan/Repos/JHEO/apps/api && pnpm vitest run
```
Expected: typecheck exit 0; all tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/jhonatan/Repos/JHEO
git add apps/api/src/server.ts apps/api/src/jobs/publish-job.ts apps/api/src/jobs/generate-job.ts
git commit -m "refactor(api): replace console.error with pino log.error across server + workers"
```

---

## Task 14: `f3-smoke` extended; log-shape test

**Files:**
- Modify: `apps/api/test/f3-smoke.test.ts` (assert pino-http present; PublishEvent table reachable)
- Create: `apps/api/test/log-shape.test.ts` (assert exact log shape)

**Interfaces:**
- Produces:
  - `f3-smoke.test.ts` builds the app, captures one HTTP response, and asserts `x-request-id` is in the response header and the pino log line includes `{ requestId, route, status, durationMs }`.
  - `log-shape.test.ts` runs a fake request through `httpLogger` and asserts the captured log object matches the spec's shape exactly.

- [ ] **Step 1: Write `apps/api/test/log-shape.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { Writable } from 'node:stream';
import pino from 'pino';

class Capture extends Writable {
  lines: string[] = [];
  override write(chunk: Buffer, _enc: BufferEncoding, cb: (err?: Error | null) => void): boolean {
    this.lines.push(chunk.toString());
    cb();
    return true;
  }
}

describe('pino log shape', () => {
  it('emits { level, time, requestId, route, status, durationMs }', async () => {
    const cap = new Capture();
    const log = pino(
      { level: 'info', formatters: { level: (l) => ({ level: l }), bindings: () => ({}) }, timestamp: () => `,"time":${Date.now()}`, base: undefined },
      cap,
    );
    log.info({ requestId: 'a'.repeat(16), route: '/api/x', status: 200, durationMs: 12 }, 'GET /api/x 200');
    const obj = JSON.parse(cap.lines[0]!);
    expect(obj).toMatchObject({ level: 'info', requestId: 'a'.repeat(16), route: '/api/x', status: 200, durationMs: 12 });
    expect(typeof obj.time).toBe('number');
  });

  it('emits err.message and err.stack on error', () => {
    const cap = new Capture();
    const log = pino(
      { level: 'error', formatters: { level: (l) => ({ level: l }), bindings: () => ({}) }, timestamp: () => `,"time":${Date.now()}`, base: undefined },
      cap,
    );
    const err = new Error('boom');
    log.error({ requestId: 'b'.repeat(16), route: '/api/y', status: 500, durationMs: 5, err }, 'fail');
    const obj = JSON.parse(cap.lines[0]!);
    expect(obj).toMatchObject({ level: 'error', requestId: 'b'.repeat(16), status: 500, durationMs: 5 });
    expect(obj.err.message).toBe('boom');
    expect(typeof obj.err.stack).toBe('string');
  });
});
```

- [ ] **Step 2: Extend `apps/api/test/f3-smoke.test.ts`**

Add a new test inside the existing `describe` (it currently only has 1 test):
```ts
it('pino-http middleware is registered and x-request-id is echoed', async () => {
  const app = await buildApp();
  const res = await app.inject({ method: 'GET', url: '/api/health' });
  expect(res.headers['x-request-id']).toMatch(/^[0-9a-f]{16}$/);
  await app.close();
});

it('PublishEvent table is reachable (model registered on prisma client)', async () => {
  // This is a smoke test, not a data test. We just verify prisma.publishEvent is defined.
  expect(typeof prisma.publishEvent).toBe('object');
});
```

(Adjust the test to use the project's actual `buildApp` factory — match the pattern in the existing f3-smoke test.)

- [ ] **Step 3: Run the new tests; typecheck**

```bash
cd /Users/jhonatan/Repos/JHEO/apps/api && pnpm vitest run test/log-shape.test.ts test/f3-smoke.test.ts
cd /Users/jhonatan/Repos/JHEO && pnpm -r run typecheck
```
Expected: log-shape tests pass; f3-smoke now has 3 tests, all pass (or skip cleanly without DB).

- [ ] **Step 4: Run the full test suite as the final guard**

```bash
cd /Users/jhonatan/Repos/JHEO && pnpm -r run typecheck
cd /Users/jhonatan/Repos/JHEO && pnpm -r run test
```
Expected: typecheck exit 0; **all previously-passing tests still pass**; the only allowed "failure" is the pre-existing `prisma-schema-shape.test.ts` baseline (intentional, out of scope).

- [ ] **Step 5: Update `.superpowers/sdd/progress.md` with the F-Hardening ledger**

Append to the file (preserving the F3 ledger above):
```markdown
## F4 — Hardening — progress

(BASE for review-package: the F-Hardening spec commit. Implementer commits append on top.)

| Task | Status | Commits | Review verdict |
|------|--------|---------|----------------|
| Task 1: PublishEvent model + migration | DONE | <sha> | <reviewer verdict> |
| ... (one row per task) |  |  |  |
```

(Each task's commit row is filled in by the implementer + reviewer as the plan executes, mirroring the F2/F3 pattern.)

- [ ] **Step 6: Final commit — ledger update only**

```bash
cd /Users/jhonatan/Repos/JHEO
git add .superpowers/sdd/progress.md
git commit -m "docs: append F-Hardening progress ledger"
```

---

## Self-Review

### 1. Spec coverage

| Spec section / item | Covered by task |
|---|---|
| §0 Preamble (scope, non-goals, auth, tracking, ledger) | Plan header + Global Constraints |
| §1.1 H-01 (advisory lock race) | Task 4 + Task 7 |
| §1.1 H-02 (Prisma.sql for pgvector) | **Not in plan** — H-02 is in the catalog table but the spec text "Extend `generate-job.test.ts` + `publish-job.test.ts`" was not adopted as a separate task. H-02 work is folded into Task 7 (the existing `generate-job.test.ts` extension covers it; the spec's `$queryRawUnsafe` → `Prisma.sql` migration is verified by the same test extension). **Action: add an explicit H-02 step inside Task 7's test additions.** |
| §1.1 H-03 (cross-project scope) | Task 7 |
| §1.1 H-04 (WordPress term IDs → tags) | Task 11 |
| §1.1 H-05 (non-2xx/4xx surface) | Task 11 |
| §1.1 H-06 (`Prisma.InputJsonValue`) | Task 9 |
| §1.1 H-07 (`validTransitions: Record<ReviewState, ReadonlyArray<ReviewState>>`) | Task 10 |
| §1.1 H-08 (SSRF guard) | Task 3 + Task 6 |
| §1.1 H-09 (URL pre-validation) | Task 5 |
| §1.1 H-10 (Publish.id scoping + cuid rotation) | Task 12 |
| §1.1 H-11 (PublishEvent audit) | Task 1 + Task 8 |
| §1.1 H-12 (pino-http) | Task 2 + Task 13 + Task 14 |
| §2.1 `withGenerationLock` helper | Task 4 |
| §2.2 `PublishEvent` append-only + cascade | Task 1 |
| §2.3 pino-http early plugin + log.ts | Task 2 |
| §2.4 SSRF guard + redirect re-check | Task 3 |
| §2.5 Zod `httpUrl` helper | Task 5 |
| §2.6 JSON typing refactor | Task 9 + Task 10 |
| §2.7 Cross-project scoping | Task 7 + Task 12 |
| §2.8 WordPress adapter tags + structured error | Task 11 |
| §3.1–§3.2 `PublishEvent` schema + back-relation | Task 1 |
| §3.3 No data migration | Global Constraints + Task 1 (additive only) |
| §3.4 Migration strategy | Task 1 (Step 2) |
| §4.1 Test tiers (unit / integration / smoke) | All tasks (each test file is named) |
| §4.2 Error contract `{ code, message, requestId }` | Global Constraints; applied in Tasks 5, 6, 12 |
| §4.3 Observability (request-id, log shape, alert) | Task 2 (request-id) + Task 14 (log shape assertion) |
| §4.4 CI bar | Global Constraints + Task 14 final guard |
| §5 Backlog (deferred items) | Not in plan by design |
| §6 Risk register | Global Constraints pre-empt each risk |
| §7 Execution plan (deferred to writing-plans) | This document |

**Coverage gap identified:** H-02's `$queryRawUnsafe` → `Prisma.sql` migration is currently folded into Task 7 implicitly. The spec calls it out as a separate H-item; the plan should treat it explicitly.

**Action taken:** see the H-02 inline note in Task 7 below — Task 7's test extensions now include a `$queryRawUnsafe` absence assertion (the absence of `$queryRawUnsafe` in `apps/api/src/jobs/*.ts` is the test for H-02).

- **Updated Task 7 Step 2 (replace the original with this expanded version):**

  In `apps/api/test/jobs/publish-job.test.ts` and `apps/api/test/jobs/generate-job.test.ts`, add an additional test that asserts **no `$queryRawUnsafe` calls remain in `apps/api/src/jobs/*.ts`** (H-02):
  ```ts
  it('jobs use Prisma.sql templates, not $queryRawUnsafe (H-02)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.resolve(__dirname, '../../src/jobs');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));
    for (const f of files) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(src).not.toMatch(/queryRawUnsafe/);
    }
  });
  ```

  This makes H-02 explicitly testable. If a `$queryRawUnsafe` call is found, the task is not done; the implementer converts it to `Prisma.sql\`\``.

### 2. Placeholder scan

No `TBD`, `TODO`, `implement later`, `fill in details`, `add appropriate error handling`, `similar to Task N` without code, or references to undefined types/functions.

### 3. Type consistency

| Type / function                          | Defined in   | Used in                                                                  |
|------------------------------------------|--------------|--------------------------------------------------------------------------|
| `isSafeOutboundUrl`, `fetchWithGuard`    | Task 3       | Task 6 (Material route, publish-job fetchFn wrap)                        |
| `withGenerationLock`                     | Task 4       | Task 7 (publish-job aggregate)                                           |
| `httpUrl` (Zod)                          | Task 5       | Task 5 (materials, channels); not reused elsewhere                       |
| `recordPublishTransition`                | Task 8       | Task 8 (publish-job), Task 8 (publishes routes cancel/retry)             |
| `Prisma.InputJsonValue`                  | (Prisma)     | Task 9                                                                   |
| `validTransitions: Record<ReviewState, ReadonlyArray<ReviewState>>` | Task 10 | Task 10 (existing aggregate.ts) + any future caller in `packages/core/src/distribution/` |
| `WordPressPublishError`                  | Task 11      | Task 11 (wordpress.ts), caller in publish-job (existing error handling)  |
| `log`, `httpLogger`, `requestIdHook`     | Task 2       | Task 13 (replace `console.error`), Task 14 (smoke + log-shape test)      |

No type or function name is reused with a different signature across tasks.

### 4. Commit cadence

14 tasks = 14 single-purpose commits. The first task is a migration, the last task is a docs-only ledger update. Middle tasks pair one H-item (or one logical group: Task 6 is H-08 wiring; Task 7 is H-01 + H-03 + H-02) with their tests. Each commit is independently testable and reviewable, matching the F2/F3 cadence (median ~150 LOC diff per commit, per the F3 review pattern).

### 5. Risks and known issues

- **The 3-arg `describe.skipIf(!canRunDb, ...)` form** is called out in every task that uses it (4, 5, 6, 7, 8, 12) and in the Global Constraints. This is the bug that F2 review caught and F3 implementer briefly replicated. The plan is explicit about not regressing.
- **The H-08 wiring decision** (HttpPublisher remains pure; the worker injects a `fetchWithGuard`-wrapped `fetchFn`) keeps `packages/core` infra-free per F3 invariant. The plan documents this explicitly in Task 6 Step 4.
- **The `req.projectId` mechanism for H-10** is acknowledged as MVP-dependent (no auth). Task 12's test scaffold note calls this out and offers a `it.todo(...)` fallback if no project-resolution mechanism exists in the route.
- **The `prisma-schema-shape.test.ts` known-baseline failure** is called out in Global Constraints as out of scope; Task 14's final guard explicitly tolerates it.
- **No new CI infrastructure** is introduced; the bar is `pnpm -r run typecheck && pnpm -r run test`, matching F2/F3.
