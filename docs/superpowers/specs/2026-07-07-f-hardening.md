# JHEO F-Hardening — Backend & Core Hardening

**Status:** approved (Sections 1–4 design-approved; this document is the formal spec)
**Date:** 2026-07-07
**Author:** brainstorming refinement of F3 final-review + carryover findings
**Depends on:** `2026-07-06-jheo-design.md` (F1), `2026-07-06-jheo-f2-design.md` (F2), `2026-07-06-jheo-f3-design.md` (F3)

## 0. Preamble

### 0.1 Scope
Backend (`apps/api`) + pure core (`packages/core`) hardening only. Twelve discrete items, each anchored to one or more tests, plus a slim test/observability/CI envelope. No public-route additions, no schema destructive changes, no data migration.

### 0.2 Non-goals
- Multi-user / auth / RBAC (single-user remains the model, per F1 spec).
- UI/DX polish (raw JSON config editor, unguarded delete, embed-during-edit, `/bundle` only-when-completed gating) — tracked separately in `docs/superpowers/specs/hardening-backlog.md`.
- CI/CD infrastructure work (GitHub Actions, deploy pipelines).
- LLM provider swap or model-router redesign.
- Re-platforming (worker topology, queue backend change, ORM swap).

### 0.3 Auth model
Single-user, no auth. Inherited verbatim from F1. No changes.

### 0.4 Tracking
Both GitHub Issues (one per H-item) and the in-repo progress ledger at `.superpowers/sdd/progress.md` (F4-Hardening section, appended after F3).

### 0.5 H-Item ledger
Each H-item is identified `H-NN` below, with a test anchor (file path) and acceptance criteria. Every H-item lands on `main` via a single task-sized commit. Review verdict per item follows the F2/F3 pattern in `.superpowers/sdd/progress.md`.

---

## 1. H-Item Catalog (12 items)

| ID    | Item                                                                                   | Test / anchor                                                                                  |
|-------|----------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------|
| H-01  | `pg_advisory_xact_lock(hash(generationId))` for publish-job race                       | `apps/api/test/db/lock.test.ts` (H-01) — concurrent aggregation; `SKIP` if no DB               |
| H-02  | `$queryRawUnsafe` → `Prisma.sql` template for pgvector literals                        | Extend `apps/api/test/jobs/generate-job.test.ts` + `apps/api/test/jobs/publish-job.test.ts`    |
| H-03  | Worker material scoping per project (cross-project fix)                                | Extend `apps/api/test/jobs/generate-job.test.ts`                                                |
| H-04  | WordPress term IDs → `tags:` field of post body                                        | `apps/api/test/wordpress.test.ts`                                                              |
| H-05  | WordPress non-2xx/4xx surface in `lastError` (no silent swallow)                       | Same                                                                                           |
| H-06  | `as object` → `Prisma.InputJsonValue` (LLM config + outputSchema)                      | typecheck = test                                                                               |
| H-07  | `validTransitions: Record<ReviewState, ReadonlyArray<ReviewState>>` typed              | typecheck = test                                                                               |
| H-08  | SSRF guard `isSafeOutboundUrl` on Material URL + HttpPublisher                         | `apps/api/test/url-guard.test.ts` (8 unit cases) + 1 integration case                          |
| H-09  | URL pre-validation: `z.string().url().refine(http\|https)`                             | Test on routes (`materials`, `channels`)                                                       |
| H-10  | `Publish.id` access scoping via `includes: { channel: { projectId } }`; cuid rotation  | Integration test on `GET /api/publishes/:id`                                                   |
| H-11  | `PublishEvent` audit table per status transition                                       | Extend `GET /api/publishes/:id` integration to assert `events` (last 50)                       |
| H-12  | `pino-http` access logs (replace `console.error` in worker + server)                   | Log-shape assertion test                                                                       |

### 1.1 H-Item acceptance criteria (selected detail)

- **H-01.** Concurrent calls to the publish-job aggregation path that target the same `generationId` must serialize: one transaction holds `pg_advisory_xact_lock`, the other blocks until commit. Test fires N concurrent aggregates and asserts exactly one "winner" runs the body, the others await.
- **H-04/H-05.** WordPress publish result records the resolved `tagIds` on the post body when the channel has a `tags:` field; if the WP REST call returns a non-2xx and non-4xx (e.g. 5xx, network reset), the response body and status surface in `Publish.lastError` and the publish goes to `failed`, not `published`.
- **H-08.** `isSafeOutboundUrl` blocks: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, `::1/128`, `fc00::/7`, plus `ftp://`, `file://`, `gopher://`, `javascript:`. 8 unit cases (private IPv4, private IPv6, link-local, punycode-rebinding, non-http schemes, malformed URL, IDN homograph, allowed public). 1 integration test on Material upload route confirms 422 (not 500) on a `http://127.0.0.1` URL.
- **H-10.** `GET /api/publishes/:id` performs a scoped lookup: 404 when the publish's channel belongs to a different project than the caller's; cuid regenerated on rotation per existing `crypto.ts` policy.
- **H-11.** Every status transition (`pending → publishing → published | failed | cancelled`, plus retry cycles) writes one immutable `PublishEvent` row carrying `fromStatus`, `toStatus`, optional `message`. Endpoint returns the last 50, ordered by `createdAt` asc.

---

## 2. Architecture

### 2.1 Advisory lock pattern (H-01)
A new helper at `apps/api/src/db.ts`:
```ts
export async function withGenerationLock<T>(
  prisma: PrismaClient,
  generationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T>
```
- Computes `BigInt` hash of the cuid (`Buffer.from(generationId).readBigUInt64BE(0)` modulo `2^63 - 1`).
- Wraps `fn` in `prisma.$transaction(async tx => { await tx.$executeRaw\`SELECT pg_advisory_xact_lock(${key})\`; return fn(tx); })`.
- Lock releases automatically on commit/rollback.
- One helper, used by publish-job aggregation path and by any future cross-worker aggregation call.

### 2.2 PublishEvent audit table (H-11)
- Append-only, immutable. `onDelete: Cascade` from `Publish`. No updates, no deletes via service code.
- Written from exactly one place per status change: the publish-job worker (after each transition) and the publishes routes (on user-initiated cancel/retry).
- `GET /api/publishes/:id` extends its `include` to `events: { take: 50, orderBy: { createdAt: 'asc' } }`.

### 2.3 Structured logging (H-12)
- New file `apps/api/src/log.ts` configures a single `pino` instance.
- `apps/api/src/server.ts` registers `pino-http` as the first Fastify plugin (before any route). It propagates `x-request-id` header (incoming or generated) into the log context.
- `console.error(...)` removed from `apps/api/src/jobs/*.ts` and `apps/api/src/server.ts`. Replaced with `log.error({ err, ... }, 'message')`.
- Log shape (asserted by test):
  ```ts
  { level: number; time: number; requestId: string; route: string; status: number; durationMs: number; err?: { message: string; stack?: string } }
  ```
- Alert threshold: any 1-minute window with `err.level === 'error'` rate > 5/min triggers a console warning. (Operationally: a process log, not an email alert; the user's environment has no alerting infra.)

### 2.4 SSRF guard (H-08)
- New file `apps/api/src/security/url-guard.ts`:
  - `export function isSafeOutboundUrl(input: string): boolean` — DNS-resolves the host, walks all A/AAAA records, rejects any in the blocklist.
  - `export async function fetchWithGuard(input: string, init?: RequestInit): Promise<Response>` — combines `isSafeOutboundUrl` + `fetch`.
  - Re-validates on each redirect (re-resolve target host, re-check).
- Blocklist (constant in the file):
  - IPv4: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, `0.0.0.0/8`, `100.64.0.0/10` (CGNAT).
  - IPv6: `::1/128`, `fc00::/7`, `fe80::/10`, `::ffff:` mapped-IPv4-of-the-above.
  - Schemes: must be `http` or `https`. Reject `file`, `ftp`, `gopher`, `data`, `javascript`, `vbscript`, plus anything not on the allowlist.
- Applied at:
  - Material URL field (validated at route via H-09, then `isSafeOutboundUrl` at fetch time).
  - HttpPublisher outbound call (replaces the existing `fetch(...)` in `packages/core/src/distribution/http.ts`).

### 2.5 Zod URL pre-validation (H-09)
- New helper `apps/api/src/validation/http-url.ts`:
  ```ts
  export const httpUrl = z.string().url().refine(
    u => { const p = new URL(u); return p.protocol === 'http:' || p.protocol === 'https:'; },
    { message: 'URL must be http(s)' }
  );
  ```
- Replaces bare `z.string().url()` in `apps/api/src/routes/materials.ts` and `apps/api/src/routes/channels.ts` (channel `config.url` field for HTTP publisher).

### 2.6 JSON typing refactor (H-06, H-07)
- File-level replace `as object` → `Prisma.InputJsonValue` across `apps/api/src/routes/` (~4–6 sites in `materials.ts`, `channels.ts`, `templates.ts`).
- `validTransitions` moved from a typed-as-`any` map to:
  ```ts
  export const validTransitions: Record<ReviewState, ReadonlyArray<ReviewState>> = { ... };
  ```
  in `packages/core/src/distribution/aggregate.ts` (alongside `aggregateReviewState`).
- Both changes are typecheck-only tests: `pnpm -r run typecheck` must remain exit 0; existing aggregate tests must pass.

### 2.7 Cross-project scoping (H-03, H-10)
- Generate-job worker: when loading materials for a generation, scope by `projectId` from the generation, not by global lookup.
- `GET /api/publishes/:id` route: `where: { id }, include: { channel: true }`, then assert `channel.projectId === req.projectId`; on mismatch return 404.
- Cuid rotation: re-uses existing rotation logic in `apps/api/src/crypto.ts`; the publish ID is regenerated once on collision (extremely rare with cuid, but the test exercises it).

### 2.8 WordPress adapter (H-04, H-05)
- `packages/core/src/distribution/wordpress.ts`:
  - `tags` field on post body now reads from the resolved term IDs (was a TODO: previously mapped to `categories?search=`).
  - Non-2xx and non-4xx response (e.g. 5xx, ECONNRESET, ETIMEDOUT) now throws a structured `WordPressPublishError` with `{ status, body }`; the publish-job worker catches and writes the body to `lastError`.

---

## 3. Data model

### 3.1 New model
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

### 3.2 Back-relation
Add to `Publish`:
```prisma
events PublishEvent[]
```

### 3.3 No data migration
The schema only **adds** `PublishEvent`. No backfill, no destructive rename, no type change on existing columns. All other H-items are in-place refactors with no schema impact.

### 3.4 Migration strategy
- `pnpm prisma migrate dev --name add_publish_event` produces a single additive SQL file.
- Migration runs on next `pnpm dev` / `pnpm start` via the existing `db-bootstrap.ts` chain.
- The `prisma-schema-shape.test.ts` known-baseline DB-auth failure (intentional, gated on `jheo_test` grants) is **out of scope** for F-Hardening.

---

## 4. Test / Observability / CI

### 4.1 Test tiers
- **Unit** — pure helpers: `url-guard.ts`, `withGenerationLock` primitive, `validTransitions` map. No DB required.
- **Integration** — routes with the existing `describe.skipIf(!canRunDb, ...)` 3-arg form (matches F2/F3 pattern; do **not** use `runIf`). Covers H-01, H-03, H-10, H-11, H-12.
- **Smoke** — extend `apps/api/test/f3-smoke.test.ts` to also assert: server boots with the new `pino-http` middleware in place (presence of `requestId` field on a sample log), `PublishEvent` table reachable via a representative publish.
- All existing tests must remain green. No test deletion, no test skip-without-DB demotion.

### 4.2 Error handling contract
- Every route returns on failure: `{ error: { code: string; message: string; requestId: string } }`. The `requestId` matches the `x-request-id` response header.
- Worker exceptions: caught at the top of `publish-job.ts` and `generate-job.ts`, written as a `PublishEvent` row (`fromStatus` = current, `toStatus` = 'failed', `message` = error.message), then surfaced via `Publish.lastError`. Retry policy (existing F3 worker) is unchanged: 3 attempts with backoff per F3 spec §6.
- SSRF violations: 422 with `code: 'unsafe_url'`, not 500. Validation violations (H-09): 400 with `code: 'invalid_url'`.

### 4.3 Observability
- **Request-id propagation:** incoming `x-request-id` header is honored if present (16-char hex) and forwarded to downstream `fetch` calls via `fetchWithGuard`. If absent, generated as `crypto.randomUUID()`. Echoed in response header.
- **Log shape (asserted by test):** `{ level, time, requestId, route, status, durationMs, err? }`. Levels: `info` for 2xx/3xx, `warn` for 4xx, `error` for 5xx and unhandled.
- **Alert threshold:** `err.level === 'error'` rate > 5/min over a rolling 1-minute window → log a single `level: 'fatal'` "alert threshold exceeded" line. No external sink in MVP.
- **Audit trail:** `GET /api/publishes/:id` returns `events` (last 50, ordered by `createdAt` asc) for human review.

### 4.4 CI
- `pnpm -r run typecheck` must remain exit 0 (catches H-06, H-07).
- `pnpm -r run test` must remain green; new tests follow `describe.skipIf(!canRunDb, ...)` 3-arg form.
- The known `prisma-schema-shape.test.ts` baseline failure is pre-existing and intentional, not in scope.
- No new CI infrastructure; existing local + manual smoke is the bar.

### 4.5 Out of scope (carryover)
- `prisma-schema-shape.test.ts` known-baseline DB-auth failure (intentional, gated on `jheo_test` grants).
- F1/F2 followups already merged (prettier, deadlock, watchdog DB, etc.).
- Cross-cutting: `agent outputDir` base-path config, WP term-resolution silent swallowing (now H-05), `/bundle` archiver race — these are now in H-12 (logging will surface them) but the **fixes** are not in H-01..H-12. Tracked in `hardening-backlog.md`.

---

## 5. Out of scope (deferred to backlog)

The following items surfaced in F3 final-review and prior reviews and are explicitly **not** part of F-Hardening. They live in `docs/superpowers/specs/hardening-backlog.md` and will be picked up in a future milestone:

- `agent outputDir` base-path configuration (currently hard-coded `/data`).
- `/bundle` archiver race (ordering of files in a streaming archive).
- WordPress term-resolution silent error swallowing (now mitigated by H-05, but not fully fixed — error path is surfaced, not the recovery path).
- Channel `config` raw-JSON editor UX.
- Unguarded channel delete.
- `getPublishFiles` only-when-completed gating.
- `embed correct, no cast needed` followup (already clean per F3 final-review).

---

## 6. Risk register

| Risk                                                                                       | Mitigation                                                                                          |
|--------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------|
| `pg_advisory_xact_lock` blocks the wrong generation if hash collides                       | Modulo `2^63 - 1` makes collision probability ~`2^-63`; the lock is `xact`-scoped, so no cross-tx bleed. Test H-01 covers concurrent same-id safety. |
| `PublishEvent` table grows unbounded on retries                                            | 50-row cap on the endpoint read; full table is unindexed-by-status beyond `createdAt`; an archival job is a future ticket. |
| SSRF guard adds DNS-resolution latency on every Material fetch                             | Cached per-host per-request via `lru-cache.ts` (F2). Cache TTL 60s. Test asserts cache hit.        |
| `pino-http` schema change breaks existing log scrapers                                      | No external scrapers exist in MVP; the schema is new and intentional.                              |
| `Prisma.InputJsonValue` refactor surfaces latent type errors in routes                    | `pnpm -r run typecheck` is the test. If it goes red, the error is the spec.                         |

---

## 7. Execution plan (deferred to writing-plans skill)

This spec is consumed by `superpowers:writing-plans` which produces the per-task implementation plan. The 12 H-items map to ~12–15 plan tasks (some items split into helper + call-site, e.g. H-08 = url-guard helper + apply-at-fetch-site + apply-at-route-site). Each task is implementer-sized (single file or single coherent edit) and review-sized (≤ 200 LOC diff).

The implementation order is not specified here; the plan will pick an order that minimises integration risk (likely: schema migration first → guard helpers → call-site swaps → tests → observability last).

---

## 8. Open questions

None at spec time. All 12 H-items, the architecture, the schema delta, and the test/observability/CI envelope were user-approved during the brainstorming phase.
