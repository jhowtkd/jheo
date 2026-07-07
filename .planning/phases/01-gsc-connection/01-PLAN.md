# Phase 1: GSC Connection — Execution Plan

**Phase:** `01-gsc-connection`  
**Requirements:** GSC-01, GSC-02, GSC-03, GSC-04, GSC-05, GSC-06  
**Context:** `@01-CONTEXT.md`  
**Patterns:** `channels.ts` + `channels-config.ts` + `crypto.ts`

## Success Criteria (from ROADMAP)

When Phase 1 is complete, all of the following must be TRUE:

1. User can upload Service Account JSON and `siteUrl` to connect GSC to a project
2. System validates SA JSON shape, encrypts credentials, and never returns ciphertext in API responses
3. Connection save tests GSC access via `sites.get` and surfaces actionable 403/404 errors with `client_email` hint
4. User can view connection status (`siteUrl`, `lastSyncAt`, `syncStatus`, `syncError`, `client_email`) and disconnect without losing snapshots
5. Decrypt failures show `decrypt_error` status and prompt re-upload instead of crashing

## Source Coverage Audit

| ID | Requirement | Task |
|----|-------------|------|
| GSC-01 | Connect via SA JSON + siteUrl | T3 (PUT) |
| GSC-02 | Validate + encrypt; never return ciphertext | T2, T3 |
| GSC-03 | `sites.get` on save; 403/404 actionable errors | T2, T3 |
| GSC-04 | View status with client_email hint | T3 (GET) |
| GSC-05 | Disconnect (delete row only) | T3 (DELETE) |
| GSC-06 | `decrypt_error` graceful handling | T3 (GET), T5 |

## Execution Order

```
T1 → T2 → T3 → T4 → T5
```

All tasks are sequential (each builds on the prior).

---

## T1: Prisma schema + migration (GscConnection only)

### Goal
Persist one GSC connection per project with encrypted SA JSON and sync metadata. No `GscSnapshot` table in this phase.

### Files to create/modify
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260707140000_add_gsc_connection/migration.sql` (timestamp may vary)

### Implementation steps

1. Add `GscConnection` model to `schema.prisma`:
   ```prisma
   model GscConnection {
     projectId               String   @id
     project                 Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
     siteUrl                 String
     serviceAccountCiphertext String
     lastSyncAt              DateTime?
     syncStatus              String   @default("idle") // idle|syncing|ok|failed|decrypt_error
     syncError               String?
     updatedAt               DateTime @updatedAt
   }
   ```
2. Add `gscConnection GscConnection?` optional relation on `Project`.
3. Create migration SQL:
   - `CREATE TABLE "GscConnection"` with `projectId` as PK and FK to `Project(id)` ON DELETE CASCADE
   - No `GscSnapshot` table
4. Run `pnpm --filter @jheo/api prisma:generate` after schema change.

### Verification command
```bash
cd apps/api && pnpm prisma:generate && pnpm typecheck
```

### Commit message suggestion
```
feat(01-gsc): add GscConnection prisma model and migration
```

---

## T2: gsc-config.ts + gsc-auth.ts + dependency

### Goal
Validate SA JSON and `siteUrl` shapes; obtain JWT access tokens and call GSC `sites.get` for connection testing.

### Files to create/modify
- `apps/api/src/gsc-config.ts` (new)
- `apps/api/src/gsc-auth.ts` (new)
- `apps/api/package.json` (add `google-auth-library@10.9.0`)

### Implementation steps

1. **Add dependency** in `apps/api/package.json`:
   ```json
   "google-auth-library": "10.9.0"
   ```
   Run `pnpm install` from repo root.

2. **`gsc-config.ts`** — mirror `channels-config.ts` style with Zod:
   - `ServiceAccountJsonSchema`: require `type: "service_account"`, `client_email`, `private_key`, `project_id` (all strings, min length 1)
   - `GscSiteUrlSchema`: accept either:
     - URL-prefix: `^https?://.+/` (trailing slash required)
     - Domain: `^sc-domain:[a-z0-9.-]+$`
   - `PutGscConnectionBodySchema`: `{ siteUrl: string, serviceAccountJson: object }`
   - Export `validateServiceAccountJson(json: unknown)` and `validateGscSiteUrl(url: string)`
   - Export parsed type `ServiceAccountJson` with `client_email`

3. **`gsc-auth.ts`** — apps/api only:
   - `getGscAccessToken(sa: ServiceAccountJson): Promise<string>` using `google-auth-library` JWT with scope `https://www.googleapis.com/auth/webmasters.readonly`
   - `testGscConnection(siteUrl: string, sa: ServiceAccountJson): Promise<{ ok: true } | { ok: false; code: 'permission_denied' | 'site_not_found' | 'api_error'; message: string; clientEmail: string }>`
   - Call `GET https://www.googleapis.com/webmasters/v3/sites/{encodeURIComponent(siteUrl)}` with Bearer token (use `encodeURIComponent` — pitfall: manual path encoding)
   - Map HTTP 403 → `permission_denied` with message: `Add {client_email} as user in GSC Settings → Users and permissions`
   - Map HTTP 404 → `site_not_found` with message: `Check siteUrl format (trailing slash for URL-prefix or sc-domain: prefix)`
   - Other errors → `api_error` with status text; never log `private_key`

### Verification command
```bash
cd apps/api && pnpm typecheck
```

### Commit message suggestion
```
feat(01-gsc): add gsc-config validation and gsc-auth sites.get test
```

---

## T3: routes/gsc.ts connection endpoints

### Goal
Expose GET/PUT/DELETE for GSC connection CRUD with encrypt-on-save, inline `sites.get` test, and safe status responses.

### Files to create/modify
- `apps/api/src/routes/gsc.ts` (new)

### Implementation steps

1. Create `gscRoutes(app: FastifyInstance)` following `channels.ts` patterns.

2. **`GET /api/projects/:projectId/gsc/connection`**
   - 404 if no row
   - Never include `serviceAccountCiphertext` in response
   - Response shape:
     ```ts
     {
       projectId, siteUrl, lastSyncAt, syncStatus, syncError,
       clientEmail: string | null  // from decrypted SA when possible
     }
     ```
   - On decrypt failure: update row `syncStatus = 'decrypt_error'`, `syncError = 'Encryption key changed — re-upload Service Account JSON'`, return 200 with that status (do not throw/crash) — **GSC-06**
   - If decrypt succeeds, extract `client_email` for response only

3. **`PUT /api/projects/:projectId/gsc/connection`**
   - Parse body with `PutGscConnectionBodySchema`; 400 on Zod failure using `{ error: { code, message } }` where practical
   - Require `JHEO_SECRET_KEY`; 503 `{ error: 'JHEO_SECRET_KEY not set' }` if missing — mirror channels
   - Validate SA JSON shape → call `testGscConnection(siteUrl, sa)` **before** persisting
   - On test failure: 400/403/404 with actionable message including `client_email` — do not save
   - On test success: `encrypt(JSON.stringify(sa), secret)` → upsert `GscConnection` with `syncStatus: 'ok'`, `syncError: null`, `updatedAt` now
   - Return same safe status shape as GET (no ciphertext)

4. **`DELETE /api/projects/:projectId/gsc/connection`**
   - Delete `GscConnection` row only (no snapshot table yet — GSC-05 satisfied by design)
   - 404 if not connected; 204 or 200 on success

5. Verify project exists before mutating (follow existing project route conventions — 404 if project missing).

### Verification command
```bash
cd apps/api && pnpm typecheck
```

### Commit message suggestion
```
feat(01-gsc): add GSC connection CRUD routes with sites.get validation
```

---

## T4: server.ts route registration

### Goal
Wire GSC routes into the Fastify app so endpoints are reachable.

### Files to create/modify
- `apps/api/src/server.ts`

### Implementation steps

1. Import: `import { gscRoutes } from './routes/gsc.js';`
2. Register after `channelRoutes` (or adjacent project-scoped routes):
   ```ts
   await app.register(gscRoutes);
   ```
3. Confirm route prefix matches existing pattern (`/api/projects/:projectId/gsc/connection` defined inside plugin).

### Verification command
```bash
cd apps/api && pnpm typecheck && pnpm test -- test/routes/gsc.test.ts 2>/dev/null || true
```
(Tests land in T5; typecheck confirms import compiles.)

### Commit message suggestion
```
feat(01-gsc): register gsc routes in server
```

---

## T5: Tests — routes + schema shape

### Goal
Lock in validation, encryption boundaries, error mapping, and schema contract with Vitest.

### Files to create/modify
- `apps/api/test/routes/gsc.test.ts` (new)
- `apps/api/test/prisma-schema-shape-gsc.test.ts` (new)

### Implementation steps

1. **`prisma-schema-shape-gsc.test.ts`** — mirror `prisma-schema-shape-f3.test.ts`:
   - DB-gated probe with `canRunDb`
   - Assert `prisma.gscConnection.findMany` is defined
   - Optional: create project + upsert connection row, verify PK is `projectId`

2. **`gsc.test.ts`** — mirror `routes/channels.test.ts` + `routes/settings.test.ts`:
   - `beforeAll`: `buildServer()` + `app.ready()`
   - **Validation (no DB required):**
     - PUT rejects missing `siteUrl` → 400
     - PUT rejects SA JSON missing `private_key` → 400
     - PUT rejects `siteUrl` without trailing slash (URL-prefix) → 400
     - PUT rejects `sc-domain:` malformed → 400
   - **Route registration:**
     - GET `/api/projects/p1/gsc/connection` returns not 404-route (status in 200/404/500)
   - **DB-gated (`it.runIf(canRunDb)`):**
     - PUT with mocked `testGscConnection` OR stub fetch: verify ciphertext stored, GET never returns ciphertext field
     - GET after simulated decrypt failure sets `syncStatus: 'decrypt_error'`
     - DELETE removes connection row
   - Mock `gsc-auth.testGscConnection` via `vi.mock('../src/gsc-auth.js')` to avoid live Google calls in CI

3. Export `testGscConnection` as named export to enable mocking.

### Verification command
```bash
cd apps/api && pnpm test -- test/routes/gsc.test.ts test/prisma-schema-shape-gsc.test.ts && pnpm typecheck
```

### Commit message suggestion
```
test(01-gsc): add GSC connection route and schema shape tests
```

---

## Phase Verification (run after all tasks)

```bash
cd /Users/jhonatan/Repos/JHEO/apps/api && pnpm test && pnpm typecheck
```

### Manual smoke (optional, requires real GSC property)

1. `PUT /api/projects/{id}/gsc/connection` with valid SA JSON + exact `siteUrl`
2. `GET` returns `syncStatus: 'ok'` and `clientEmail`
3. `DELETE` disconnects; subsequent GET returns 404

---

## Out of Scope (deferred)

- `GscSnapshot` table, BullMQ `gscQueue`, cron — Phase 2+
- `GET /overview`, `/queries`, `/pages`, `POST /sync` — Phases 2–3
- `gsc-low-ctr` audit plugin, publish inspect hook — Phase 4
- Web UI — Phase 6

---

*Plan created: 2026-07-07*
