# Phase 1: GSC Connection - Pattern Map

**Mapped:** 2026-07-07
**Files analyzed:** 9 new/modified
**Analogs found:** 8 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/api/prisma/schema.prisma` | model | CRUD | `DistributionChannel` + `Setting` in same file | exact |
| `apps/api/prisma/migrations/20260707XXXXXX_add_gsc_connection/migration.sql` | migration | batch | `migrations/20260707130000_add_project_pages/migration.sql` | exact |
| `apps/api/src/gsc-config.ts` | utility | transform | `apps/api/src/channels-config.ts` | exact |
| `apps/api/src/gsc-auth.ts` | service | request-response | `apps/api/src/server.ts` (`resolveKey`) + RESEARCH `gsc-auth` sketch | partial |
| `apps/api/src/routes/gsc.ts` | route | request-response | `apps/api/src/routes/channels.ts` + `settings.ts` | exact |
| `apps/api/src/server.ts` | config | — | existing route registration block | exact |
| `apps/api/package.json` | config | — | existing `dependencies` block | exact |
| `apps/api/test/routes/gsc.test.ts` | test | request-response | `test/routes/settings.test.ts` + `channels.test.ts` | exact |
| `apps/api/test/prisma-schema-shape-gsc.test.ts` | test | CRUD | `test/prisma-schema-shape-f3.test.ts` | exact |

## Pattern Assignments

### `apps/api/prisma/schema.prisma` — GscConnection model (model, CRUD)

**Analog:** `DistributionChannel` (encrypted credential + project FK) + `Setting` (ciphertext field naming)

**1:1 project relation + encrypted field** (lines 68-82, 123-127):

```68:82:apps/api/prisma/schema.prisma
model DistributionChannel {
  id              String   @id @default(cuid())
  projectId       String
  project         Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  type            String   // 'wordpress' | 'http' | 'agent'
  name            String
  configEncrypted String
  configSchema    String
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  publishes       Publish[]

  @@index([projectId])
  @@index([type])
}
```

```123:127:apps/api/prisma/schema.prisma
model Setting {
  key             String   @id
  valueCiphertext String
  updatedAt       DateTime @updatedAt
}
```

**Project back-relation** (lines 11-21) — add `gscConnection GscConnection?` alongside existing relations:

```11:21:apps/api/prisma/schema.prisma
model Project {
  id                   String                @id @default(cuid())
  name                 String
  rootUrl              String
  createdAt            DateTime              @default(now())
  audits               Audit[]
  materials            Material[]
  generations          Generation[]
  distributionChannels DistributionChannel[]
  pages                ProjectPage[]
}
```

**GscConnection shape (planner discretion):** Use `projectId String @id` for 1:1 (mirrors `Setting.key` as natural PK). Fields per CONTEXT: `siteUrl`, `serviceAccountCiphertext`, `lastSyncAt`, `syncStatus`, `syncError`, `updatedAt`. Status stored as `String` comment like other models (`Audit.status`, `Publish.status`). No `GscSnapshot` relation in Phase 1.

---

### `apps/api/prisma/migrations/20260707XXXXXX_add_gsc_connection/migration.sql` (migration, batch)

**Analog:** `migrations/20260707130000_add_project_pages/migration.sql`

**Table + index + FK pattern** (lines 1-16):

```1:16:apps/api/prisma/migrations/20260707130000_add_project_pages/migration.sql
CREATE TABLE "ProjectPage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "discoveredVia" TEXT NOT NULL,
    "lastAuditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectPage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectPage_projectId_url_key" ON "ProjectPage"("projectId", "url");
CREATE INDEX "ProjectPage_projectId_idx" ON "ProjectPage"("projectId");

ALTER TABLE "ProjectPage" ADD CONSTRAINT "ProjectPage_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

**Copy for GscConnection:** `CREATE TABLE "GscConnection"` with `projectId` as `PRIMARY KEY`, `ON DELETE CASCADE` FK to `"Project"("id")`, `updatedAt TIMESTAMP(3) NOT NULL` (Prisma `@updatedAt`).

---

### `apps/api/src/gsc-config.ts` (utility, transform)

**Analog:** `apps/api/src/channels-config.ts`

**Imports + Zod object exports** (lines 1-3, 64-75):

```1:3:apps/api/src/channels-config.ts
import { z } from 'zod';
import { UnsafeUrlError, assertSafeUrl } from './security/url-guard.js';
import { httpUrl } from './validation/http-url.js';
```

```64:75:apps/api/src/channels-config.ts
export const CreateChannelBodySchema = z.object({
  name: z.string().min(1).max(120),
  type: ChannelTypeSchema,
  config: z.unknown(),
  isActive: z.boolean().default(true),
});

export const UpdateChannelBodySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  config: z.unknown().optional(),
  isActive: z.boolean().optional(),
});
```

**Discriminated inner validation** (lines 77-88):

```77:88:apps/api/src/channels-config.ts
export function validateConfig(type: string, config: unknown): unknown {
  switch (type) {
    case 'wordpress':
      return WordPressConfigSchema.parse(config);
    case 'http':
      return HttpConfigSchema.parse(config);
    case 'agent':
      return AgentConfigSchema.parse(config);
    default:
      throw new Error(`unknown channel type: ${type}`);
  }
}
```

**GSC-specific validation (from CONTEXT + PITFALLS):**
- Export `PutGscConnectionBodySchema = z.object({ siteUrl: GscSiteUrlSchema, serviceAccountJson: z.unknown() })`
- `GscSiteUrlSchema`: `z.union` or `superRefine` — `^sc-domain:[a-z0-9.-]+$` OR `^https?://.+/` (trailing slash required)
- `ServiceAccountJsonSchema`: `z.object({ type: z.literal('service_account'), client_email: z.string().email(), private_key: z.string().min(1), project_id: z.string().min(1) })`
- Export `validateServiceAccountJson(input: unknown)` that `.parse()`s and returns typed object (same as `validateConfig`)
- Do **not** use `httpUrl` / `assertSafeUrl` for `siteUrl` — GSC `sc-domain:` is not http(s)

---

### `apps/api/src/gsc-auth.ts` (service, request-response)

**Analog:** `apps/api/src/server.ts` credential resolution (partial) + `.planning/research/ARCHITECTURE.md` JWT sketch

**Decrypt-then-use secret pattern** (lines 152-160):

```152:160:apps/api/src/server.ts
  async function resolveKey(providerEnv: string, settingKey: string): Promise<string | undefined> {
    const row = await defaultPrisma.setting.findUnique({ where: { key: settingKey } });
    if (row) {
      if (!env.JHEO_SECRET_KEY) return undefined;
      return decrypt(row.valueCiphertext, env.JHEO_SECRET_KEY);
    }
    return process.env[providerEnv];
  }
```

**No existing `google-auth-library` usage** — planner should implement per RESEARCH:

- Accept parsed SA JSON object (from `gsc-config.ts`)
- `import { JWT } from 'google-auth-library'`
- Scope: `https://www.googleapis.com/auth/webmasters.readonly`
- Export `getGscAccessToken(saJson: ServiceAccountJson): Promise<string>`
- Export `testGscConnection(saJson, siteUrl): Promise<{ ok: true } | { ok: false; status: number; message: string }>` calling `GET https://www.googleapis.com/webmasters/v3/sites/{encodeURIComponent(siteUrl)}`
- Keep module in `apps/api` only (not `@jheo/core`)

---

### `apps/api/src/routes/gsc.ts` (route, request-response)

**Analog:** `channels.ts` (encrypt/write) + `settings.ts` (upsert/delete) + `materials.ts` (project guard + structured errors)

**Route module shell** (lines 1-11, 34):

```1:11:apps/api/src/routes/channels.ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { encrypt, decrypt } from '../crypto.js';
import { loadEnv } from '../env.js';
import { LruCache } from '../lru-cache.js';
import {
  CreateChannelBodySchema,
  UpdateChannelBodySchema,
  validateConfig,
} from '../channels-config.js';
```

```34:34:apps/api/src/routes/channels.ts
export async function channelRoutes(app: FastifyInstance): Promise<void> {
```

**Export name:** `gscRoutes` matching `channelRoutes`, `settingsRoutes`.

**Project existence guard** (materials.ts lines 80-81):

```80:81:apps/api/src/routes/materials.ts
      const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
      if (!project) return reply.code(404).send({ error: 'project not found' });
```

**Note:** GSC CONTEXT uses `:id` in path (`/api/projects/:id/gsc/connection`). Match param name to existing routes — `projectId` is used in channels/materials/generations; prefer `projectId` for consistency unless CONTEXT path is fixed to `:projectId`.

**Zod safeParse + flatten** (settings.ts lines 22-23):

```22:23:apps/api/src/routes/settings.ts
      const parsed = PutBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
```

**JHEO_SECRET_KEY gate on write** (channels.ts lines 90-92, settings.ts lines 24-26):

```90:92:apps/api/src/routes/channels.ts
      const env = loadEnv();
      const secret = env.JHEO_SECRET_KEY;
      if (!secret) return reply.code(503).send({ error: 'JHEO_SECRET_KEY not set' });
```

```24:26:apps/api/src/routes/settings.ts
      const env = loadEnv();
      const secret = env.JHEO_SECRET_KEY;
      if (!secret) return reply.code(503).send({ error: 'JHEO_SECRET_KEY not set' });
```

**Encrypt JSON credentials** (channels.ts lines 93-99):

```93:99:apps/api/src/routes/channels.ts
      const ciphertext = encrypt(JSON.stringify(validatedConfig), secret);
      const row = await prisma.distributionChannel.create({
        data: {
          projectId: req.params.projectId,
          type,
          name,
          configEncrypted: ciphertext,
```

**Upsert for 1:1 connection** (settings.ts lines 28-33):

```28:33:apps/api/src/routes/settings.ts
      const row = await prisma.setting.upsert({
        where: { key },
        update: { valueCiphertext: ciphertext },
        create: { key, valueCiphertext: ciphertext },
      });
      return { key: row.key, updatedAt: row.updatedAt };
```

**PUT flow for GSC:** validate body → `validateServiceAccountJson` → encrypt full SA JSON → `testGscConnection` (sites.get) → on success `prisma.gscConnection.upsert` with `syncStatus: 'ok'`; on GSC 403/404 return actionable `{ error: { code, message, requestId } }` without saving (or save with `syncStatus: 'failed'` per planner discretion).

**GET status without ciphertext** — mirror settings list (no values) + channels list (no `configEncrypted`):

```10:13:apps/api/src/routes/settings.ts
  app.get('/api/settings', async () => {
    const rows = await prisma.setting.findMany({ orderBy: { key: 'asc' } });
    return rows.map((r) => ({ key: r.key, updatedAt: r.updatedAt }));
  });
```

```45:52:apps/api/src/routes/channels.ts
        return rows.map((r) => ({
          id: r.id,
          projectId: r.projectId,
          type: r.type,
          name: r.name,
          isActive: r.isActive,
          createdAt: r.createdAt,
        }));
```

**GET response fields:** `siteUrl`, `client_email` (from decrypt for display only — never return ciphertext or full JSON), `lastSyncAt`, `syncStatus`, `syncError`, `updatedAt`. Return 404 when no row.

**Decrypt failure → `decrypt_error`** (channels.ts lines 117-125):

```117:125:apps/api/src/routes/channels.ts
      if (env.JHEO_SECRET_KEY) {
        try {
          const decrypted = decrypt(row.configEncrypted, env.JHEO_SECRET_KEY);
          config = JSON.parse(decrypted);
        } catch (e) {
          // Log so decryption failures aren't invisible — they're operationally
          // significant. The frontend sees `config: null` either way.
          reply.log.warn({ err: e, channelId: row.id }, 'channel decrypt failed');
        }
      }
```

**GSC variant:** On GET decrypt failure, update row `syncStatus: 'decrypt_error'`, `syncError` hint, return status with `client_email: null` and re-upload message.

**Structured error codes** (materials.ts lines 119-126):

```119:126:apps/api/src/routes/materials.ts
        if (isHttpUrlProtocolError(parsed.error)) {
          return reply.code(400).send({
            error: {
              code: 'invalid_url',
              message: 'URL must be http(s)',
              requestId: req.id,
            },
          });
        }
```

**GSC error codes (CONTEXT):**
- `gsc_permission_denied` (403) — message includes `client_email`
- `gsc_site_not_found` (404) — trailing slash / `sc-domain:` hint
- `decrypt_error` — on GET when ciphertext corrupt
- Use `requestId: req.id` on structured errors

**DELETE disconnect** (settings.ts lines 37-42):

```37:42:apps/api/src/routes/settings.ts
  app.delete<{ Params: { key: string } }>('/api/settings/:key', async (req, reply) => {
    // deleteMany is a single round-trip and a no-op when nothing matches,
    // so we map its affected-row count to 404.
    const result = await prisma.setting.deleteMany({ where: { key: req.params.key } });
    if (result.count === 0) return reply.code(404).send({ error: 'not found' });
    return { key: req.params.key };
  });
```

**Endpoints:**
- `GET /api/projects/:projectId/gsc/connection`
- `PUT /api/projects/:projectId/gsc/connection`
- `DELETE /api/projects/:projectId/gsc/connection`

---

### `apps/api/src/crypto.ts` — reuse, do not duplicate (utility, transform)

**Analog:** self — import `encrypt` / `decrypt` directly

**Encrypt** (lines 36-42):

```36:42:apps/api/src/crypto.ts
export function encrypt(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}
```

**Decrypt** (lines 44-52):

```44:52:apps/api/src/crypto.ts
export function decrypt(payload: string, secret: string): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
```

Store `encrypt(JSON.stringify(saJson), secret)` in `serviceAccountCiphertext`.

---

### `apps/api/src/env.ts` — JHEO_SECRET_KEY (config)

**Analog:** existing `EnvSchema` — no changes required unless GSC-specific env vars added (Phase 1: none)

```12:16:apps/api/src/env.ts
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  JHEO_SECRET_KEY: z.string().optional(),
```

---

### `apps/api/src/server.ts` (config)

**Analog:** existing route registration

**Import + register** (lines 22-26, 134-142):

```22:26:apps/api/src/server.ts
import { settingsRoutes } from './routes/settings.js';
import { templateRoutes } from './routes/templates.js';
import { generationRoutes } from './routes/generations.js';
import { channelRoutes } from './routes/channels.js';
import { publishRoutes } from './routes/publishes.js';
```

```134:142:apps/api/src/server.ts
  await app.register(healthRoutes);
  await app.register(projectRoutes);
  await app.register(auditRoutes);
  await app.register(materialRoutes);
  await app.register(settingsRoutes);
  await app.register(templateRoutes);
  await app.register(generationRoutes);
  await app.register(channelRoutes);
  await app.register(publishRoutes);
```

**Add:** `import { gscRoutes } from './routes/gsc.js';` and `await app.register(gscRoutes);` after `channelRoutes` (credential routes grouped together).

---

### `apps/api/package.json` (config)

**Analog:** existing dependency entry style

```17:29:apps/api/package.json
  "dependencies": {
    "@fastify/cors": "9.0.1",
    "@jheo/core": "workspace:*",
    "@mozilla/readability": "0.6.0",
    "@prisma/client": "5.18.0",
    "bullmq": "5.12.0",
    "fastify": "4.28.1",
    "ioredis": "5.4.1",
    "jsdom": "24.1.0",
    "pg": "8.12.0",
    "pino": "^9",
    "pino-http": "^10",
    "zod": "3.23.8"
  },
```

**Add:** `"google-auth-library": "10.9.0"` per CONTEXT (apps/api only).

---

### `apps/api/test/routes/gsc.test.ts` (test, request-response)

**Analog:** `test/routes/settings.test.ts` + `test/routes/channels.test.ts`

**Server bootstrap** (settings.test.ts lines 1-21):

```1:21:apps/api/test/routes/settings.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { buildServer } from '../../src/server.js';
import { prisma } from '../../src/db.js';

let app: Awaited<ReturnType<typeof buildServer>>;
let canRunDb = false;

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    canRunDb = true;
  } catch {
    canRunDb = false;
  }
});
afterAll(async () => {
  await app.close();
});
```

**Validation-only tests (no DB)** (channels.test.ts lines 13-54):

```13:34:apps/api/test/routes/channels.test.ts
describe('routes/channels validation', () => {
  it('rejects unknown channel type', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/channels',
      payload: { name: 'n', type: 'unknown', config: {} },
    });
    expect(r.statusCode).toBe(400);
  });

  it('rejects wordpress config missing siteUrl', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/channels',
      payload: {
        name: 'wp',
        type: 'wordpress',
        config: { username: 'u', appPassword: 'p' },
      },
    });
    expect(r.statusCode).toBe(400);
  });
```

**GSC validation tests (always run):**
- Reject missing `siteUrl` / `serviceAccountJson`
- Reject SA JSON missing `client_email` / `private_key`
- Reject `siteUrl` without trailing slash (`https://example.com`)
- Accept `sc-domain:example.com` shape at schema level (400 if invalid)
- Reject PUT when `JHEO_SECRET_KEY` unset → 503 (mirror settings)

**DB-gated integration** (settings.test.ts lines 33-63):

```33:63:apps/api/test/routes/settings.test.ts
  it.runIf(canRunDb)('round-trips an encrypted value', async () => {
    const secret = process.env.JHEO_SECRET_KEY ?? '';
    expect(secret.length).toBeGreaterThan(0);
    const plaintext = `sk-test-${crypto.randomBytes(6).toString('hex')}`;

    const putRes = await app.inject({
      method: 'PUT',
      url: '/api/settings/openai_api_key',
      payload: { value: plaintext },
    });
    expect(putRes.statusCode).toBe(200);

    const row = await prisma.setting.findUnique({ where: { key: 'openai_api_key' } });
    expect(row).not.toBeNull();
    // At minimum, decrypt must round-trip:
    const { decrypt } = await import('../../src/crypto.js');
    expect(decrypt(row!.valueCiphertext, secret)).toBe(plaintext);

    // List hides values
    const list = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(list.statusCode).toBe(200);
    expect(list.json().find((s: { key: string; value?: string }) => s.key === 'openai_api_key')).toEqual({
      key: 'openai_api_key',
    });

    // Delete works
    const del = await app.inject({ method: 'DELETE', url: '/api/settings/openai_api_key' });
    expect(del.statusCode).toBe(200);
    const after = await prisma.setting.findUnique({ where: { key: 'openai_api_key' } });
    expect(after).toBeNull();
  });
```

**GSC DB tests:** Create project → PUT connection (mock `gsc-auth` or use `vi.mock('../src/gsc-auth.js')` to stub `testGscConnection`) → assert ciphertext in DB, GET omits ciphertext, DELETE removes row. Mock pattern exists in `audit-job-cache.test.ts` (`vi.mock`).

**Route registration smoke** (channels.test.ts lines 56-73):

```56:73:apps/api/test/routes/channels.test.ts
  it('accepts a well-formed wordpress config with 201 (DB gated)', async () => {
    // Skipped without DB; just verify the route is registered (not 404).
    const r = await app.inject({
      method: 'POST',
      url: '/api/projects/p1/channels',
      payload: {
        name: 'wp',
        type: 'wordpress',
        config: {
          siteUrl: 'https://example.com',
          username: 'u',
          appPassword: 'p',
          defaultStatus: 'draft',
        },
      },
    });
    expect([200, 201, 404, 500, 503]).toContain(r.statusCode);
  });
```

---

### `apps/api/test/prisma-schema-shape-gsc.test.ts` (test, CRUD)

**Analog:** `test/prisma-schema-shape-f3.test.ts`

**DB probe + skip pattern** (lines 1-24):

```1:24:apps/api/test/prisma-schema-shape-f3.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';

// setup.ts forces DATABASE_URL, so `it.runIf(Boolean(process.env.DATABASE_URL))`
// would let this run and fail with Postgres auth. Probe the connection first.
let canRunDb = false;

beforeAll(async () => {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    canRunDb = true;
  } catch {
    canRunDb = false;
  }
});

afterAll(async () => {
  // Disconnect prisma so vitest can exit cleanly even when the test was skipped.
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
});
```

**Model assertion** (lines 26-30):

```26:30:apps/api/test/prisma-schema-shape-f3.test.ts
describe('prisma schema (F3)', () => {
  it.runIf(canRunDb)('declares Publish', async () => {
    await expect((prisma as unknown as { publish: { findMany: unknown } }).publish.findMany).toBeDefined();
  });
});
```

**GSC variant:** `describe('prisma schema (GSC)')` → `prisma.gscConnection.findMany({ take: 0 })` resolves (after `prisma generate` + migrate).

---

## Shared Patterns

### Encryption (AES-256-GCM)
**Source:** `apps/api/src/crypto.ts` (lines 36-52)
**Apply to:** `routes/gsc.ts` PUT handler
- Always `JSON.stringify` before encrypt
- Always check `JHEO_SECRET_KEY` before encrypt (503)
- Never include `serviceAccountCiphertext` in GET responses

### Validation (Zod)
**Source:** `apps/api/src/channels-config.ts` + `apps/api/src/routes/settings.ts`
**Apply to:** `gsc-config.ts`, `routes/gsc.ts`
- Export schemas from config module; routes call `safeParse` then domain `validate*` functions
- 400 with `parsed.error.flatten()` for shape errors
- Structured `{ error: { code, message, requestId } }` for domain errors (GSC 403/404 mapping)

### Project-scoped routes
**Source:** `apps/api/src/routes/materials.ts`, `channels.ts`, `generations.ts`
**Apply to:** all `gsc.ts` handlers
- Path prefix: `/api/projects/:projectId/gsc/...`
- Verify project exists before mutating (404 `project not found`)

### Prisma conventions
**Source:** `apps/api/prisma/schema.prisma`
**Apply to:** `GscConnection` model + migration
- `String` status fields with inline comment for allowed values
- `@relation(..., onDelete: Cascade)` on project FK
- Ciphertext field suffix: `*Ciphertext` (`valueCiphertext`, `configEncrypted` → `serviceAccountCiphertext`)

### Server registration
**Source:** `apps/api/src/server.ts` (lines 134-142)
**Apply to:** register `gscRoutes` in `buildServer()` alongside other route plugins

### Test DB gating
**Source:** `test/routes/settings.test.ts`, `test/prisma-schema-shape-f3.test.ts`
**Apply to:** both new test files
- Probe `prisma.$queryRawUnsafe('SELECT 1')` in `beforeAll`
- `it.runIf(canRunDb)` for integration tests
- Validation tests run without DB

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `apps/api/src/gsc-auth.ts` | service | request-response | No Google API / JWT code in codebase yet; use RESEARCH ARCHITECTURE sketch + `server.ts` decrypt pattern |

## Metadata

**Analog search scope:** `apps/api/src/`, `apps/api/prisma/`, `apps/api/test/`
**Files scanned:** ~25 route, config, crypto, schema, migration, and test files
**Pattern extraction date:** 2026-07-07
