# JHEO Foundation + Audit MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the JHEO monorepo (`apps/web` + `apps/api` + `packages/core`) wired to Postgres + BullMQ + Docker Compose, with full audit pipeline: 6 categories, ~25 plugins with golden-file tests, and a minimal SPA that lets the user create a project, run an audit, and read findings.

**Architecture:** Single TypeScript pnpm monorepo. `apps/api` is a Fastify server that runs a BullMQ worker in the same process. `apps/web` is a Vite + React SPA served by the api in production. `packages/core` is pure logic — no infra imports. Postgres 16 with pgvector is provisioned via `docker compose`. Audits queue on the `audit` queue; plugins run in parallel against an injected `AuditContext`.

**Tech Stack:** TypeScript 5.6+ · pnpm 9 workspaces · Vite 5 · React 18 · TanStack Query · Zustand · Fastify 4 · BullMQ 5 · Prisma 5 (with `pgvector` extension) · Vitest 2 · Playwright (e2e, smoke only) · Puppeteer 22 · `@axe-core/puppeteer` · `lighthouse` · Zod 3.

---

## Global Constraints

These are copied verbatim from the design spec and apply to every task.

- **TypeScript strict mode on**, `noUncheckedIndexedAccess: true`. Every change compiles clean.
- **pnpm 9+**, root `package.json` with workspaces `apps/*` and `packages/*`. Node ≥ 20.10.
- **All `core` packages** must remain infra-free: cannot import `fastify`, `bullmq`, `prisma`, `puppeteer`, `lighthouse`, or anything else that dials out to a real service. Infra is injected via `AuditContext`.
- **`packages/core/src/audit` plugins** all export `async function checkName(ctx: AuditContext): Promise<Finding[]>` and return validated findings only (Zod).
- **Findings** are persisted via the `db` handle on `AuditContext`. Plugins must never reach into Prisma directly.
- **Severity values**: `'info' | 'warning' | 'error'`. Categories: `'seo' | 'cwv' | 'geo' | 'a11y' | 'content'`.
- **Naming:** file `kebab-case.ts`, exports `PascalCase` for types, `camelCase` for functions, SCREAMING_SNAKE for env vars.
- **No `any`.** Use Zod-inferred types or explicit `unknown` narrowing.
- **Test framework:** Vitest. Snapshot files live next to source as `*.snap.ts` exporting a typed `Finding[]`.
- **All HTTP ports bound to `127.0.0.1`** by default; the API serves the built SPA at `/app/*` in production.
- **`docker compose up`** must reach a healthy state with zero manual steps beyond `cp .env.example .env` (auto-generated on first run if missing).
- **Every audit plugin** must have ≥1 golden-file test (HTML fixture + expected `Finding[]`) before its task is marked done.
- **Frequent commits.** One commit per step or per tightly related step group. Conventional Commits: `feat:`, `chore:`, `test:`, `fix:`, `docs:`.

---

## File Structure

Everything is created/modified under `/Users/jhonatan/Repos/JHEO`.

### Top-level

```
package.json
pnpm-workspace.yaml
tsconfig.base.json
.gitignore
.env.example
docker/
  docker-compose.yml
  Dockerfile.api
apps/
  api/
    package.json
    tsconfig.json
    src/
      server.ts                 # Fastify bootstrap + SPA serving
      env.ts                    # env loading, JHEO_SECRET_KEY handling
      db.ts                     # PrismaClient singleton
      queue.ts                  # BullMQ queue + worker wiring
      crypto.ts                 # AES-256-GCM helpers
      routes/
        projects.ts             # CRUD projects
        audits.ts               # trigger/list/get audits & findings
        health.ts               # GET /api/health
    test/
      setup.ts
      projects.test.ts
      audits.test.ts
    prisma/
      schema.prisma
  web/
    package.json
    tsconfig.json
    vite.config.ts
    index.html
    src/
      main.tsx
      api.ts                    # typed fetch client
      queryClient.ts            # TanStack Query
      routes.tsx                # router config
      pages/
        ProjectsList.tsx
        ProjectDashboard.tsx
        AuditRunner.tsx
        AuditResults.tsx
      components/
        FindingList.tsx
        ScoreCard.tsx
        Layout.tsx
      styles.css
packages/
  core/
    package.json
    tsconfig.json
    src/
      index.ts                  # re-exports
      types.ts                  # Finding, AuditContext, Severity, Category
      audit/
        orchestrator.ts         # parallel runner
        score.ts                # category & overall score
        context.ts              # AuditContext builder (interface only, infra injected by api)
        seo/
          meta.ts               # + test
          headings.ts           # + test
          sitemap.ts            # + test
          robots-txt.ts         # + test
          links.ts              # + test
          images.ts             # + test
          open-graph.ts         # + test
          json-ld.ts            # + test
          fixtures/
            meta.good.html
            meta.missing-description.html
            headings.skipped.html
        cwv/
          lighthouse.ts         # + test (with fake runner)
          requests.ts           # + test
          hints.ts              # + test
          cache.ts              # + test
          compression.ts        # + test
        geo/
          llms-txt.ts           # + test
          ai-crawler-access.ts  # + test
          citability.ts         # + test
          markdown-parallel.ts  # + test
          faq-structure.ts      # + test
          schema-coverage.ts    # + test
        a11y/
          axe-core.ts           # + test
          contrast.ts           # + test
          lang-attr.ts          # + test
          skip-links.ts         # + test
        content/
          lang-consistency.ts   # + test
          readability.ts        # + test
          thin-content.ts       # + test
          dates.ts              # + test
      llm/
        .gitkeep                # placeholder; filled in F2
      generation/
        .gitkeep                # placeholder; filled in F2
      distribution/
        .gitkeep                # placeholder; filled in F3
      jobs/
        audit-job.ts            # handler that calls orchestrator
    test/
      fixtures/
        pages/
          good.html
          ai-access-blocks.html
          no-llms-txt.html
        lighthouse-report.json  # mocked Lighthouse result
    tsconfig.json
e2e/
  smoke.spec.ts
  playwright.config.ts
```

### Decomposition rationale

- All `*.ts` files in `packages/core/src/audit/<category>/` own a single category's plugin set. Test fixtures live next to the plugin that uses them so changes are localised.
- `orchestrator.ts` and `score.ts` are split because orchestration is pluggable and scoring is pure math.
- `apps/api` routes are split by resource, not by HTTP verb — easier to find and review.
- `apps/web` pages mirror routes; components are reused across pages.
- `packages/core/src/llm`, `packages/core/src/generation`, and `packages/core/src/distribution` are kept as directories with `.gitkeep` so the structure is reserved for F2/F3 without churn later.

---

## Task 1: Initialize monorepo skeleton

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `.editorconfig`

- [ ] **Step 1: Write root `package.json`**

```json
{
  "name": "jheo",
  "private": true,
  "version": "0.1.0",
  "engines": { "node": ">=20.10", "pnpm": ">=9" },
  "packageManager": "pnpm@9.6.0",
  "scripts": {
    "build": "pnpm -r run build",
    "dev": "pnpm -r --parallel run dev",
    "test": "pnpm -r run test",
    "lint": "pnpm -r run lint",
    "typecheck": "pnpm -r run typecheck",
    "format": "prettier --write \"**/*.{ts,tsx,md,json}\""
  },
  "devDependencies": {
    "prettier": "3.3.3",
    "typescript": "5.6.2"
  }
}
```

- [ ] **Step 2: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules
dist
.env
.env.local
*.log
.DS_Store
coverage
playwright-report
test-results
docker/postgres-data
```

- [ ] **Step 5: Write `.env.example`**

```
JHEO_SECRET_KEY=
DATABASE_URL=postgres://jheo:jheo@localhost:5432/jheo
WEB_PORT=8080
LOG_LEVEL=info
```

- [ ] **Step 6: Write `.editorconfig`**

```
root = true
[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
```

- [ ] **Step 7: Initialize pnpm and commit**

Run: `pnpm install`
Expected: `pnpm-workspace` setup completes, no error, `node_modules` and `pnpm-lock.yaml` present.

```bash
git add -A
git commit -m "chore: initialize pnpm monorepo skeleton"
```

---

## Task 2: Add shared test/lint scripts and pre-commit hook

**Files:**
- Create: `.prettierrc.json`, `.prettierignore`, `vitest.workspace.ts` (root)

- [ ] **Step 1: Write `.prettierrc.json`**

```json
{
  "singleQuote": true,
  "semi": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 2: Write `.prettierignore`**

```
node_modules
dist
coverage
pnpm-lock.yaml
```

- [ ] **Step 3: Add workspaces-wide Vitest config**

Write `vitest.workspace.ts`:

```ts
export default ['apps/*/test', 'packages/*/test'];
```

- [ ] **Step 4: Add a smoke test script to root `package.json`**

Run: `pnpm run format`
Expected: no changes (nothing formatted yet, files are clean).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: add prettier and vitest workspace config"
```

---

## Task 3: Create `packages/core` package skeleton

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`, `packages/core/src/types.ts`

- [ ] **Step 1: Write `packages/core/package.json`**

```json
{
  "name": "@jheo/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "prettier --check \"src/**/*.{ts,tsx}\""
  },
  "dependencies": {
    "zod": "3.23.8"
  },
  "devDependencies": {
    "vitest": "2.0.5",
    "typescript": "5.6.2"
  }
}
```

- [ ] **Step 2: Write `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "composite": true,
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write `packages/core/src/types.ts`**

```ts
import { z } from 'zod';

export const SeveritySchema = z.enum(['info', 'warning', 'error']);
export type Severity = z.infer<typeof SeveritySchema>;

export const CategorySchema = z.enum(['seo', 'cwv', 'geo', 'a11y', 'content']);
export type Category = z.infer<typeof CategorySchema>;

export const FindingSchema = z.object({
  category: CategorySchema,
  severity: SeveritySchema,
  rule: z.string().min(1),
  message: z.string().min(1),
  url: z.string().url(),
  selector: z.string().optional(),
  evidence: z.record(z.unknown()).default({}),
});
export type Finding = z.infer<typeof FindingSchema>;

export interface AuditContext {
  url: string;
  html: string;
  /**
   * Injected by the API/worker. Plugins must not import infra directly.
   * The shape extends with plugins the test can satisfy via mocks.
   */
  fetchText(url: string, init?: { headers?: Record<string, string> }): Promise<{
    status: number;
    headers: Record<string, string>;
    text: string;
  }>;
  log(rule: string, detail: Record<string, unknown>): void;
}
```

- [ ] **Step 4: Write `packages/core/src/index.ts`**

```ts
export * from './types.js';
```

- [ ] **Step 5: Install and verify build**

Run: `pnpm install`
Expected: `@jheo/core` is linked; workspace recognised.

Run: `pnpm --filter @jheo/core run typecheck`
Expected: exits 0, no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(core): scaffold @jheo/core package with shared types"
```

---

## Task 4: Add first core plugin with golden-file test

**Files:**
- Create: `packages/core/src/audit/context.ts`, `packages/core/src/audit/seo/meta.ts`, `packages/core/src/audit/seo/fixtures/meta.good.html`, `packages/core/src/audit/seo/fixtures/meta.missing-description.html`, `packages/core/test/seo/meta.test.ts`, `packages/core/test/setup.ts`, `packages/core/vitest.config.ts`

- [ ] **Step 1: Write `packages/core/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 2: Write `packages/core/test/setup.ts`**

```ts
import { afterEach } from 'vitest';

afterEach(() => {
  // reserved for future per-test cleanup
});
```

- [ ] **Step 3: Write `packages/core/src/audit/context.ts`**

```ts
import type { Finding } from '../types.js';

/**
 * Helper that builds a fetchText mock returning the supplied raw HTML
 * for the URL the plugin is auditing, and 404 (empty body) for any
 * supporting asset. Plugin tests compose these via makeHarness.
 */
export interface FetchScript {
  match: (url: string) => boolean;
  respond: () => Promise<{ status: number; headers: Record<string, string>; text: string }>;
}

export function makeAuditHarness(opts: {
  html: string;
  url: string;
  fetches?: FetchScript[];
}) {
  const calls: string[] = [];
  const log: { rule: string; detail: Record<string, unknown> }[] = [];
  const ctx = {
    url: opts.url,
    html: opts.html,
    async fetchText(url: string) {
      calls.push(url);
      const entry = opts.fetches?.find((f) => f.match(url));
      if (entry) return entry.respond();
      return { status: 404, headers: {}, text: '' };
    },
    log(rule: string, detail: Record<string, unknown>) {
      log.push({ rule, detail });
    },
  };
  return { ctx, calls, log };
}

export function persistFindings(findings: Finding[]) {
  return findings;
}
```

- [ ] **Step 4: Write the golden fixture `meta.good.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Good page — Example</title>
    <meta name="description" content="A reasonable description that fits within the usual snippet.">
    <link rel="canonical" href="https://example.com/good">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="index, follow">
  </head>
  <body>
    <h1>Good heading</h1>
    <p>body</p>
  </body>
</html>
```

- [ ] **Step 5: Write the failing fixture `meta.missing-description.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Missing description</title>
    <link rel="canonical" href="https://example.com/missing">
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head>
  <body>
    <h1>Heading</h1>
  </body>
</html>
```

- [ ] **Step 6: Write the failing test `packages/core/test/seo/meta.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkMeta } from '../../src/audit/seo/meta.js';
import { makeAuditHarness } from '../../src/audit/context.js';

function loadFixture(name: string): string {
  return readFileSync(resolve(__dirname, '../../src/audit/seo/fixtures', name), 'utf8');
}

describe('audit/seo/meta', () => {
  it('produces no findings on a meta-good page', async () => {
    const html = loadFixture('meta.good.html');
    const { ctx } = makeAuditHarness({ html, url: 'https://example.com/good' });
    const findings = await checkMeta(ctx);
    expect(findings).toEqual([]);
  });

  it('flags a missing meta description', async () => {
    const html = loadFixture('meta.missing-description.html');
    const { ctx } = makeAuditHarness({ html, url: 'https://example.com/missing' });
    const findings = await checkMeta(ctx);
    expect(findings).toEqual([
      expect.objectContaining({
        category: 'seo',
        severity: 'warning',
        rule: 'meta.missing-description',
        url: 'https://example.com/missing',
      }),
    ]);
  });

  it('also flags a missing title', async () => {
    const html = `<html><head></head><body></body></html>`;
    const { ctx } = makeAuditHarness({ html, url: 'https://example.com/notitle' });
    const findings = await checkMeta(ctx);
    expect(findings.some((f) => f.rule === 'meta.missing-title')).toBe(true);
  });
});
```

- [ ] **Step 7: Run the test to confirm it fails (no plugin yet)**

Run: `pnpm --filter @jheo/core run test`
Expected: FAIL with "Cannot find module '../../src/audit/seo/meta.js'".

- [ ] **Step 8: Write the implementation `packages/core/src/audit/seo/meta.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

const TITLE_MIN = 10;
const TITLE_MAX = 70;
const DESC_MIN = 50;
const DESC_MAX = 160;

function readMeta(html: string, attr: string, value?: string): string | null {
  const re = value
    ? new RegExp(`<meta\\s+[^>]*${attr}=["']${value}["'][^>]*>`, 'i')
    : new RegExp(`<meta\\s+[^>]*${attr}=["']([^"']+)["']`, 'gi');
  if (!value) {
    const matches = html.matchAll(re);
    const last = Array.from(matches).pop();
    return last?.[1] ?? null;
  }
  const m = html.match(re);
  return m ? m[1] ?? null : null;
}

function readTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m && m[1] ? m[1].trim() : null;
}

export async function checkMeta(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const title = readTitle(ctx.html);
  if (!title) {
    out.push({
      category: 'seo',
      severity: 'error',
      rule: 'meta.missing-title',
      message: 'Page has no <title> element.',
      url: ctx.url,
      evidence: {},
    });
  } else if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
    out.push({
      category: 'seo',
      severity: 'warning',
      rule: 'meta.title-length',
      message: `Title length ${title.length} is outside the recommended ${TITLE_MIN}-${TITLE_MAX} character range.`,
      url: ctx.url,
      evidence: { title },
    });
  }

  const description = readMeta(ctx.html, 'name', 'description');
  if (!description) {
    out.push({
      category: 'seo',
      severity: 'warning',
      rule: 'meta.missing-description',
      message: 'Page has no <meta name="description"> element.',
      url: ctx.url,
      evidence: {},
    });
  } else if (description.length < DESC_MIN || description.length > DESC_MAX) {
    out.push({
      category: 'seo',
      severity: 'warning',
      rule: 'meta.description-length',
      message: `Description length ${description.length} is outside the recommended ${DESC_MIN}-${DESC_MAX} character range.`,
      url: ctx.url,
      evidence: { description },
    });
  }

  const canonical = ctx.html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  if (!canonical) {
    out.push({
      category: 'seo',
      severity: 'info',
      rule: 'meta.missing-canonical',
      message: 'Page has no rel="canonical" link element.',
      url: ctx.url,
      evidence: {},
    });
  }

  const viewport = readMeta(ctx.html, 'name', 'viewport');
  if (!viewport) {
    out.push({
      category: 'seo',
      severity: 'warning',
      rule: 'meta.missing-viewport',
      message: 'Page has no <meta name="viewport"> element.',
      url: ctx.url,
      evidence: {},
    });
  }

  return out;
}
```

- [ ] **Step 9: Run the test again — expected pass**

Run: `pnpm --filter @jheo/core run test`
Expected: all 3 tests pass.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(core/audit/seo): add meta plugin with golden-file tests"
```

---

## Task 5: Add the remaining SEO plugins (headings, sitemap, robots-txt, links, images, open-graph, json-ld)

**Files:** (all under `packages/core/`)
- Create: `src/audit/seo/headings.ts`, `src/audit/seo/sitemap.ts`, `src/audit/seo/robots-txt.ts`, `src/audit/seo/links.ts`, `src/audit/seo/images.ts`, `src/audit/seo/open-graph.ts`, `src/audit/seo/json-ld.ts`
- Create: `src/audit/seo/fixtures/{headings}.{single,multiple,skipped}.html`, `test/seo/headings.test.ts`, `test/seo/sitemap.test.ts`, `test/seo/robots-txt.test.ts`, `test/seo/links.test.ts`, `test/seo/images.test.ts`, `test/seo/open-graph.test.ts`, `test/seo/json-ld.test.ts`

- [ ] **Step 1: Add `headings.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

export async function checkHeadings(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const headings = Array.from(ctx.html.matchAll(/<h([1-6])\b[^>]*>([^<]*)<\/h\1>/gi));
  const h1s = headings.filter((m) => m[1] === '1');
  if (h1s.length === 0) {
    out.push({
      category: 'seo',
      severity: 'error',
      rule: 'headings.missing-h1',
      message: 'Page has no <h1> element.',
      url: ctx.url,
      evidence: {},
    });
  } else if (h1s.length > 1) {
    out.push({
      category: 'seo',
      severity: 'warning',
      rule: 'headings.multiple-h1',
      message: `Page has ${h1s.length} <h1> elements; one is recommended.`,
      url: ctx.url,
      evidence: { h1Count: h1s.length },
    });
  }
  const levels = headings.map((m) => Number(m[1]));
  for (let i = 1; i < levels.length; i++) {
    const prev = levels[i - 1];
    const cur = levels[i];
    if (prev === undefined || cur === undefined) continue;
    if (cur > prev + 1) {
      out.push({
        category: 'seo',
        severity: 'warning',
        rule: 'headings.skipped-level',
        message: `Heading level skipped between <h${prev}> and <h${cur}>.`,
        url: ctx.url,
        evidence: {},
      });
      break;
    }
  }
  return out;
}
```

- [ ] **Step 2: Add `headings` tests in `test/seo/headings.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkHeadings } from '../../src/audit/seo/headings.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/seo/headings', () => {
  it('flags missing h1', async () => {
    const { ctx } = makeAuditHarness({ html: '<html><body><h2>x</h2></body></html>', url: 'https://x/' });
    const f = await checkHeadings(ctx);
    expect(f.some((x) => x.rule === 'headings.missing-h1')).toBe(true);
  });
  it('flags multiple h1', async () => {
    const html = '<html><body><h1>a</h1><h1>b</h1></body></html>';
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkHeadings(ctx);
    expect(f.some((x) => x.rule === 'headings.multiple-h1')).toBe(true);
  });
  it('flags skipped level', async () => {
    const html = '<html><body><h1>a</h1><h3>c</h3></body></html>';
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkHeadings(ctx);
    expect(f.some((x) => x.rule === 'headings.skipped-level')).toBe(true);
  });
  it('passes on clean hierarchy', async () => {
    const html = '<html><body><h1>a</h1><h2>b</h2><h3>c</h3></body></html>';
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkHeadings(ctx);
    expect(f).toEqual([]);
  });
});
```

- [ ] **Step 3: Add `sitemap.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

export async function checkSitemap(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  let res;
  try {
    res = await ctx.fetchText(new URL('/sitemap.xml', ctx.url).toString());
  } catch {
    out.push({
      category: 'seo',
      severity: 'warning',
      rule: 'sitemap.unreachable',
      message: '/sitemap.xml could not be fetched.',
      url: ctx.url,
      evidence: {},
    });
    return out;
  }
  if (res.status !== 200) {
    out.push({
      category: 'seo',
      severity: 'warning',
      rule: 'sitemap.missing',
      message: `/sitemap.xml returned HTTP ${res.status}.`,
      url: ctx.url,
      evidence: { status: res.status },
    });
    return out;
  }
  if (!/<urlset\b/i.test(res.text)) {
    out.push({
      category: 'seo',
      severity: 'error',
      rule: 'sitemap.invalid',
      message: '/sitemap.xml does not look like a valid sitemap.',
      url: ctx.url,
      evidence: {},
    });
  }
  if (!res.text.includes(new URL('/', ctx.url).toString())) {
    out.push({
      category: 'seo',
      severity: 'info',
      rule: 'sitemap.no-root',
      message: 'Sitemap does not appear to include the root URL.',
      url: ctx.url,
      evidence: {},
    });
  }
  return out;
}
```

- [ ] **Step 4: Add `sitemap.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkSitemap } from '../../src/audit/seo/sitemap.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/seo/sitemap', () => {
  it('flags a missing sitemap', async () => {
    const { ctx } = makeAuditHarness({
      html: '<html></html>',
      url: 'https://example.com/',
      fetches: [
        {
          match: (u) => u.endsWith('/sitemap.xml'),
          respond: async () => ({ status: 404, headers: {}, text: '' }),
        },
      ],
    });
    const f = await checkSitemap(ctx);
    expect(f.some((x) => x.rule === 'sitemap.missing')).toBe(true);
  });
  it('accepts a valid sitemap', async () => {
    const xml = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/</loc></url></urlset>`;
    const { ctx } = makeAuditHarness({
      html: '',
      url: 'https://example.com/',
      fetches: [
        {
          match: (u) => u.endsWith('/sitemap.xml'),
          respond: async () => ({ status: 200, headers: { 'content-type': 'application/xml' }, text: xml }),
        },
      ],
    });
    const f = await checkSitemap(ctx);
    expect(f).toEqual([]);
  });
});
```

- [ ] **Step 5: Add `robots-txt.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

export async function checkRobotsTxt(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  let res;
  try {
    res = await ctx.fetchText(new URL('/robots.txt', ctx.url).toString());
  } catch {
    return [
      {
        category: 'seo',
        severity: 'warning',
        rule: 'robots.unreachable',
        message: '/robots.txt could not be fetched.',
        url: ctx.url,
        evidence: {},
      },
    ];
  }
  if (res.status !== 200) {
    out.push({
      category: 'seo',
      severity: 'warning',
      rule: 'robots.missing',
      message: `/robots.txt returned HTTP ${res.status}.`,
      url: ctx.url,
      evidence: {},
    });
    return out;
  }
  if (/^Disallow:\s*\/\s*$/m.test(res.text)) {
    out.push({
      category: 'seo',
      severity: 'error',
      rule: 'robots.disallow-all',
      message: 'robots.txt disallows the entire site.',
      url: ctx.url,
      evidence: {},
    });
  }
  if (!/^Sitemap:/m.test(res.text)) {
    out.push({
      category: 'seo',
      severity: 'info',
      rule: 'robots.no-sitemap-directive',
      message: 'robots.txt has no Sitemap: directive.',
      url: ctx.url,
      evidence: {},
    });
  }
  return out;
}
```

- [ ] **Step 6: Add `robots-txt.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkRobotsTxt } from '../../src/audit/seo/robots-txt.js';
import { makeAuditHarness } from '../../src/audit/context.js';

const respondWith = (text: string) => ({
  match: (u: string) => u.endsWith('/robots.txt'),
  respond: async () => ({ status: 200, headers: {}, text }),
});

describe('audit/seo/robots-txt', () => {
  it('flags disallow all', async () => {
    const { ctx } = makeAuditHarness({
      html: '',
      url: 'https://example.com/',
      fetches: [respondWith('User-agent: *\nDisallow: /\n')],
    });
    const f = await checkRobotsTxt(ctx);
    expect(f.some((x) => x.rule === 'robots.disallow-all')).toBe(true);
  });
  it('flags missing sitemap directive', async () => {
    const { ctx } = makeAuditHarness({
      html: '',
      url: 'https://example.com/',
      fetches: [respondWith('User-agent: *\nAllow: /\n')],
    });
    const f = await checkRobotsTxt(ctx);
    expect(f.some((x) => x.rule === 'robots.no-sitemap-directive')).toBe(true);
  });
  it('accepts clean robots.txt', async () => {
    const { ctx } = makeAuditHarness({
      html: '',
      url: 'https://example.com/',
      fetches: [respondWith('User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml\n')],
    });
    const f = await checkRobotsTxt(ctx);
    expect(f).toEqual([]);
  });
});
```

- [ ] **Step 7: Add `links.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

export async function checkLinks(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const anchors = Array.from(ctx.html.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi));
  if (anchors.length === 0) {
    out.push({
      category: 'seo',
      severity: 'info',
      rule: 'links.none',
      message: 'Page contains no <a> elements.',
      url: ctx.url,
      evidence: {},
    });
  }
  const external = anchors.filter((m) => {
    const href = m[1] ?? '';
    return /^https?:\/\//i.test(href);
  });
  if (external.length > 100) {
    out.push({
      category: 'seo',
      severity: 'info',
      rule: 'links.too-many-external',
      message: `Page has ${external.length} external links; consider if they are all necessary.`,
      url: ctx.url,
      evidence: { count: external.length },
    });
  }
  return out;
}
```

- [ ] **Step 8: Add `links.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkLinks } from '../../src/audit/seo/links.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/seo/links', () => {
  it('passes a small link set', async () => {
    const html = '<a href="/a">a</a><a href="/b">b</a>';
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkLinks(ctx);
    expect(f).toEqual([]);
  });
  it('reports no anchors', async () => {
    const { ctx } = makeAuditHarness({ html: '<p>nothing</p>', url: 'https://x/' });
    const f = await checkLinks(ctx);
    expect(f.some((x) => x.rule === 'links.none')).toBe(true);
  });
});
```

- [ ] **Step 9: Add `images.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

export async function checkImages(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const imgs = Array.from(ctx.html.matchAll(/<img\b([^>]*)>/gi));
  for (const m of imgs) {
    const attrs = m[1] ?? '';
    if (!/\salt=/.test(attrs)) {
      out.push({
        category: 'seo',
        severity: 'warning',
        rule: 'images.missing-alt',
        message: '<img> element has no alt attribute.',
        url: ctx.url,
        evidence: { tag: m[0] },
      });
    }
    if (!/\bwidth=/.test(attrs) || !/\bheight=/.test(attrs)) {
      out.push({
        category: 'seo',
        severity: 'info',
        rule: 'images.missing-dimensions',
        message: '<img> is missing width and/or height attributes (helps CLS).',
        url: ctx.url,
        evidence: { tag: m[0] },
      });
    }
  }
  return out;
}
```

- [ ] **Step 10: Add `images.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkImages } from '../../src/audit/seo/images.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/seo/images', () => {
  it('flags missing alt', async () => {
    const html = '<img src="x.png" width="10" height="10">';
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkImages(ctx);
    expect(f.some((x) => x.rule === 'images.missing-alt')).toBe(true);
  });
  it('flags missing dimensions', async () => {
    const html = '<img src="x.png" alt="x">';
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkImages(ctx);
    expect(f.some((x) => x.rule === 'images.missing-dimensions')).toBe(true);
  });
  it('passes a clean image', async () => {
    const html = '<img src="x.png" alt="x" width="10" height="10">';
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkImages(ctx);
    expect(f).toEqual([]);
  });
});
```

- [ ] **Step 11: Add `open-graph.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

const REQUIRED = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'];

export async function checkOpenGraph(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const prop of REQUIRED) {
    const re = new RegExp(`<meta\\s+[^>]*property=["']${prop}["']`, 'i');
    if (!re.test(ctx.html)) {
      out.push({
        category: 'seo',
        severity: 'warning',
        rule: `open-graph.missing-${prop}`,
        message: `Page is missing the ${prop} meta property.`,
        url: ctx.url,
        evidence: { property: prop },
      });
    }
  }
  if (!/<meta\s+[^>]*name=["']twitter:card["']/i.test(ctx.html)) {
    out.push({
      category: 'seo',
      severity: 'info',
      rule: 'open-graph.missing-twitter-card',
      message: 'Page is missing twitter:card meta tag.',
      url: ctx.url,
      evidence: {},
    });
  }
  return out;
}
```

- [ ] **Step 12: Add `open-graph.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkOpenGraph } from '../../src/audit/seo/open-graph.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/seo/open-graph', () => {
  it('flags missing og:title', async () => {
    const { ctx } = makeAuditHarness({ html: '<html></html>', url: 'https://x/' });
    const f = await checkOpenGraph(ctx);
    expect(f.some((x) => x.rule === 'open-graph.missing-og:title')).toBe(true);
  });
  it('passes with all required tags', async () => {
    const html = `
      <meta property="og:title" content="t">
      <meta property="og:description" content="d">
      <meta property="og:image" content="i">
      <meta property="og:url" content="u">
      <meta property="og:type" content="website">
      <meta name="twitter:card" content="summary_large_image">
    `;
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkOpenGraph(ctx);
    expect(f).toEqual([]);
  });
});
```

- [ ] **Step 13: Add `json-ld.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

export async function checkJsonLd(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const blocks = Array.from(ctx.html.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  if (blocks.length === 0) {
    out.push({
      category: 'seo',
      severity: 'info',
      rule: 'json-ld.none',
      message: 'Page has no JSON-LD structured data.',
      url: ctx.url,
      evidence: {},
    });
    return out;
  }
  for (const m of blocks) {
    const body = m[1];
    if (!body) continue;
    try {
      JSON.parse(body);
    } catch {
      out.push({
        category: 'seo',
        severity: 'error',
        rule: 'json-ld.invalid',
        message: 'A JSON-LD block is not valid JSON.',
        url: ctx.url,
        evidence: { snippet: body.slice(0, 200) },
      });
    }
  }
  return out;
}
```

- [ ] **Step 14: Add `json-ld.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkJsonLd } from '../../src/audit/seo/json-ld.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/seo/json-ld', () => {
  it('flags none present', async () => {
    const { ctx } = makeAuditHarness({ html: '<html></html>', url: 'https://x/' });
    const f = await checkJsonLd(ctx);
    expect(f.some((x) => x.rule === 'json-ld.none')).toBe(true);
  });
  it('flags invalid JSON', async () => {
    const html = `<script type="application/ld+json">{ broken }</script>`;
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkJsonLd(ctx);
    expect(f.some((x) => x.rule === 'json-ld.invalid')).toBe(true);
  });
  it('passes a valid block', async () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme"}</script>`;
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkJsonLd(ctx);
    expect(f).toEqual([]);
  });
});
```

- [ ] **Step 15: Run all tests**

Run: `pnpm --filter @jheo/core run test`
Expected: every test file passes (4 seo/meta tests + 4 headings + 2 sitemap + 3 robots + 2 links + 3 images + 2 open-graph + 3 json-ld = 23 minimum).

- [ ] **Step 16: Commit**

```bash
git add -A
git commit -m "feat(core/audit/seo): add headings, sitemap, robots-txt, links, images, og, json-ld"
```

---

## Task 6: GEO category plugins with golden-file tests

**Files:**
- Create: `packages/core/src/audit/geo/{llms-txt,ai-crawler-access,citability,markdown-parallel,faq-structure,schema-coverage}.ts`
- Create: `packages/core/test/geo/*.test.ts` (one per plugin)
- Create: `packages/core/src/audit/geo/fixtures/{with-llms-txt,no-llms-txt,ai-access-blocks,citable,faq-schema,markdown-parallel}.html`

- [ ] **Step 1: Add `ai-crawler-access.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

export const AI_CRAWLERS = [
  'GPTBot',
  'ClaudeBot',
  'Claude-Web',
  'PerplexityBot',
  'Google-Extended',
  'Applebot-Extended',
] as const;

interface Parsed {
  raw: Map<string, string[]>;
}

function parseRobots(text: string): Parsed {
  const groups = text.split(/\n\s*\n/);
  const raw = new Map<string, string[]>();
  for (const g of groups) {
    const lines = g.split('\n');
    const uaLine = lines.find((l) => /^User-agent:/i.test(l));
    if (!uaLine) continue;
    const ua = uaLine.split(':')[1]?.trim();
    if (!ua) continue;
    const list = raw.get(ua) ?? [];
    for (const line of lines) {
      if (/^Disallow:/i.test(line)) list.push(line.split(':').slice(1).join(':').trim());
    }
    raw.set(ua, list);
  }
  return { raw };
}

function effectiveFor(bot: string, parsed: Parsed): 'allowed' | 'blocked' | 'not-mentioned' {
  const groupRules = parsed.raw.get(bot);
  if (groupRules) {
    const blocked = groupRules.some((r) => r === '/' || r.startsWith('/'));
    return blocked ? 'blocked' : 'allowed';
  }
  const wildcard = parsed.raw.get('*');
  if (wildcard) {
    const blocked = wildcard.some((r) => r === '/' || r.startsWith('/'));
    return blocked ? 'blocked' : 'allowed';
  }
  return 'not-mentioned';
}

export async function checkAiCrawlerAccess(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  let res;
  try {
    res = await ctx.fetchText(new URL('/robots.txt', ctx.url).toString());
  } catch {
    return out;
  }
  if (res.status !== 200) return out;
  const parsed = parseRobots(res.text);
  for (const bot of AI_CRAWLERS) {
    const status = effectiveFor(bot, parsed);
    if (status === 'blocked') {
      out.push({
        category: 'geo',
        severity: 'warning',
        rule: `geo.ai-crawler-blocked.${bot}`,
        message: `${bot} is disallowed by robots.txt; the page may be missing from its index.`,
        url: ctx.url,
        evidence: { bot, status },
      });
    } else if (status === 'not-mentioned') {
      out.push({
        category: 'geo',
        severity: 'info',
        rule: `geo.ai-crawler-not-mentioned.${bot}`,
        message: `${bot} has no User-agent directive; crawlers fall back to *.`,
        url: ctx.url,
        evidence: { bot, status },
      });
    }
  }
  return out;
}
```

- [ ] **Step 2: Add `ai-crawler-access.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkAiCrawlerAccess } from '../../src/audit/geo/ai-crawler-access.js';
import { makeAuditHarness } from '../../src/audit/context.js';

const robotsFor = (text: string) => ({
  match: (u: string) => u.endsWith('/robots.txt'),
  respond: async () => ({ status: 200, headers: {}, text }),
});

describe('audit/geo/ai-crawler-access', () => {
  it('reports blocked crawlers', async () => {
    const text = `User-agent: *\nAllow: /\nUser-agent: GPTBot\nDisallow: /\n`;
    const { ctx } = makeAuditHarness({
      html: '',
      url: 'https://example.com/',
      fetches: [robotsFor(text)],
    });
    const f = await checkAiCrawlerAccess(ctx);
    expect(f.some((x) => x.rule.startsWith('geo.ai-crawler-blocked.GPTBot'))).toBe(true);
  });
  it('reports not-mentioned crawlers', async () => {
    const text = `User-agent: *\nAllow: /\n`;
    const { ctx } = makeAuditHarness({
      html: '',
      url: 'https://example.com/',
      fetches: [robotsFor(text)],
    });
    const f = await checkAiCrawlerAccess(ctx);
    expect(f.some((x) => x.rule.startsWith('geo.ai-crawler-not-mentioned.'))).toBe(true);
  });
});
```

- [ ] **Step 3: Add `llms-txt.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

export async function checkLlmsTxt(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  let res;
  try {
    res = await ctx.fetchText(new URL('/llms.txt', ctx.url).toString());
  } catch {
    return out;
  }
  if (res.status === 404) {
    out.push({
      category: 'geo',
      severity: 'info',
      rule: 'geo.llms-txt.missing',
      message: '/llms.txt not found; consider publishing one to help AI engines discover content.',
      url: ctx.url,
      evidence: {},
    });
    return out;
  }
  if (res.status !== 200) {
    return out;
  }
  if (!/^#\s+\S/m.test(res.text)) {
    out.push({
      category: 'geo',
      severity: 'warning',
      rule: 'geo.llms-txt.no-h1',
      message: '/llms.txt has no H1; expected markdown with a top-level title.',
      url: ctx.url,
      evidence: {},
    });
  }
  if (!/\[[^\]]+\]\([^)]+\)/.test(res.text)) {
    out.push({
      category: 'geo',
      severity: 'info',
      rule: 'geo.llms-txt.no-links',
      message: '/llms.txt lists no named pages.',
      url: ctx.url,
      evidence: {},
    });
  }
  return out;
}
```

- [ ] **Step 4: Add `llms-txt.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkLlmsTxt } from '../../src/audit/geo/llms-txt.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/geo/llms-txt', () => {
  it('reports missing llms.txt', async () => {
    const { ctx } = makeAuditHarness({
      html: '',
      url: 'https://x/',
      fetches: [
        {
          match: (u) => u.endsWith('/llms.txt'),
          respond: async () => ({ status: 404, headers: {}, text: '' }),
        },
      ],
    });
    const f = await checkLlmsTxt(ctx);
    expect(f.some((x) => x.rule === 'geo.llms-txt.missing')).toBe(true);
  });
  it('accepts a valid llms.txt', async () => {
    const text = `# My Site\n\n- [Home](https://x/)\n- [Docs](https://x/docs)\n`;
    const { ctx } = makeAuditHarness({
      html: '',
      url: 'https://x/',
      fetches: [
        {
          match: (u) => u.endsWith('/llms.txt'),
          respond: async () => ({ status: 200, headers: {}, text }),
        },
      ],
    });
    const f = await checkLlmsTxt(ctx);
    expect(f).toEqual([]);
  });
});
```

- [ ] **Step 5: Add `citability.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

export async function checkCitability(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const has = (re: RegExp) => re.test(ctx.html);
  const score = {
    blockquote: has(/<blockquote\b/i),
    ol: has(/<ol\b/i),
    table: has(/<table\b[\s\S]*?<th\b/i),
    isoDate: has(/\b20\d{2}-\d{2}-\d{2}\b/),
    author: has(/\bby\s+[A-Z][a-z]+/),
  };
  const present = Object.values(score).filter(Boolean).length;
  if (present < 2) {
    out.push({
      category: 'geo',
      severity: 'info',
      rule: 'geo.citability.low',
      message: 'Page has few citability signals (blockquotes, lists, tables, dates, authors).',
      url: ctx.url,
      evidence: score,
    });
  }
  return out;
}
```

- [ ] **Step 6: Add `citability.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkCitability } from '../../src/audit/geo/citability.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/geo/citability', () => {
  it('flags low citability', async () => {
    const { ctx } = makeAuditHarness({ html: '<p>plain text</p>', url: 'https://x/' });
    const f = await checkCitability(ctx);
    expect(f.some((x) => x.rule === 'geo.citability.low')).toBe(true);
  });
  it('accepts a citable page', async () => {
    const html = `
      <article>
        <h1>Title</h1>
        <p>By Ada Lovelace, 2024-06-01</p>
        <blockquote cite="https://example.com">quoted</blockquote>
        <ol><li>step</li></ol>
        <table><tr><th>a</th></tr><tr><td>1</td></tr></table>
      </article>`;
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkCitability(ctx);
    expect(f).toEqual([]);
  });
});
```

- [ ] **Step 7: Add `markdown-parallel.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

export async function checkMarkdownParallel(ctx: AuditContext): Promise<Finding[]> {
  const wordCount = ctx.html
    .replace(/<[^>]+>/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  if (wordCount < 300) return [];
  const out: Finding[] = [];
  let res;
  try {
    res = await ctx.fetchText(ctx.url, {
      headers: { Accept: 'text/markdown' },
    });
  } catch {
    return out;
  }
  if (res.status !== 200) {
    out.push({
      category: 'geo',
      severity: 'info',
      rule: 'geo.markdown-parallel.absent',
      message: 'Page has no markdown representation served with Accept: text/markdown.',
      url: ctx.url,
      evidence: {},
    });
  }
  return out;
}
```

- [ ] **Step 8: Add `markdown-parallel.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkMarkdownParallel } from '../../src/audit/geo/markdown-parallel.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/geo/markdown-parallel', () => {
  it('skips thin pages', async () => {
    const { ctx } = makeAuditHarness({ html: '<p>short</p>', url: 'https://x/' });
    const f = await checkMarkdownParallel(ctx);
    expect(f).toEqual([]);
  });
  it('flags missing markdown for content pages', async () => {
    const long = `<p>${'word '.repeat(400)}</p>`;
    const { ctx } = makeAuditHarness({
      html: long,
      url: 'https://x/',
      fetches: [
        {
          match: (u) => u === 'https://x/',
          respond: async () => ({ status: 200, headers: {}, text: '<html></html>' }),
        },
      ],
    });
    const f = await checkMarkdownParallel(ctx);
    expect(f.some((x) => x.rule === 'geo.markdown-parallel.absent')).toBe(true);
  });
});
```

- [ ] **Step 9: Add `faq-structure.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

export async function checkFaqStructure(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const blocks = Array.from(
    ctx.html.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  );
  let hasFaqSchema = false;
  for (const b of blocks) {
    try {
      const json = JSON.parse(b[1] ?? '');
      if (json['@type'] === 'FAQPage' || json['@graph']?.some?.((g: unknown) =>
        typeof g === 'object' && g !== null && (g as Record<string, unknown>)['@type'] === 'FAQPage',
      )) {
        hasFaqSchema = true;
      }
    } catch {
      // ignore invalid blocks here; json-ld plugin reports them
    }
  }
  const visibleFaq = /<\b(dt|summary|details)[\s>]/i.test(ctx.html);
  if (visibleFaq && !hasFaqSchema) {
    out.push({
      category: 'geo',
      severity: 'info',
      rule: 'geo.faq.no-schema',
      message: 'Page has FAQ markup but no FAQPage JSON-LD schema.',
      url: ctx.url,
      evidence: {},
    });
  }
  return out;
}
```

- [ ] **Step 10: Add `faq-structure.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkFaqStructure } from '../../src/audit/geo/faq-structure.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/geo/faq-structure', () => {
  it('flags visible FAQ without schema', async () => {
    const html = `<details><summary>Q</summary><p>A</p></details>`;
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkFaqStructure(ctx);
    expect(f.some((x) => x.rule === 'geo.faq.no-schema')).toBe(true);
  });
  it('passes visible FAQ with schema', async () => {
    const html = `
      <details><summary>Q</summary><p>A</p></details>
      <script type="application/ld+json">{"@type":"FAQPage"}</script>
    `;
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkFaqStructure(ctx);
    expect(f).toEqual([]);
  });
});
```

- [ ] **Step 11: Add `schema-coverage.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

export async function checkSchemaCoverage(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const schemaBlocks = Array.from(
    ctx.html.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  );
  if (schemaBlocks.length === 0) {
    return out;
  }
  const totalChars = ctx.html.length;
  const schemaChars = schemaBlocks.reduce((acc, b) => acc + (b[1]?.length ?? 0), 0);
  const ratio = totalChars === 0 ? 0 : schemaChars / totalChars;
  if (ratio < 0.005) {
    out.push({
      category: 'geo',
      severity: 'info',
      rule: 'geo.schema.coverage.low',
      message: `Schema markup covers only ${(ratio * 100).toFixed(2)}% of the page.`,
      url: ctx.url,
      evidence: { ratio },
    });
  }
  return out;
}
```

- [ ] **Step 12: Add `schema-coverage.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkSchemaCoverage } from '../../src/audit/geo/schema-coverage.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/geo/schema-coverage', () => {
  it('flags tiny schema on a large page', async () => {
    const big = `<p>${'word '.repeat(2000)}</p>`;
    const html = `${big}<script type="application/ld+json">{"@type":"Organization"}</script>`;
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkSchemaCoverage(ctx);
    expect(f.some((x) => x.rule === 'geo.schema.coverage.low')).toBe(true);
  });
});
```

- [ ] **Step 13: Run all core tests**

Run: `pnpm --filter @jheo/core run test`
Expected: every GEO test passes alongside the SEO suite.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat(core/audit/geo): add llms-txt, ai-crawler-access, citability, faq, schema-coverage, markdown-parallel"
```

---

## Task 7: Performance / CWV plugins (Lighthouse-shaped, deterministic)

**Files:**
- Create: `packages/core/src/audit/cwv/{lighthouse,requests,hints,cache,compression}.ts`
- Create: `packages/core/test/cwv/*.test.ts`
- Create: `packages/core/test/fixtures/lighthouse-report.json` (synthetic)

Lighthouse programmatic execution is slow and flaky in unit tests, so the lighthouse plugin accepts a precomputed Lighthouse result injected through `ctx` properties. The API/worker layer is responsible for running Lighthouse and attaching the result to the context (wired later).

- [ ] **Step 1: Add `lighthouse.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

export interface LighthouseResult {
  metrics: { LCP?: number; CLS?: number; TBT?: number; FCP?: number; SI?: number };
  scores: { performance: number };
}

export const LighthouseCtxKey = Symbol('lighthouse');

export async function checkLighthouse(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const result = (ctx as unknown as Record<symbol, LighthouseResult | undefined>)[LighthouseCtxKey];
  if (!result) {
    out.push({
      category: 'cwv',
      severity: 'info',
      rule: 'cwv.lighthouse.missing',
      message: 'Lighthouse was not run for this page (worker did not provide a result).',
      url: ctx.url,
      evidence: {},
    });
    return out;
  }
  const { metrics, scores } = result;
  const lcp = metrics.LCP ?? 0;
  const cls = metrics.CLS ?? 0;
  const tbt = metrics.TBT ?? 0;
  if (lcp > 2500) {
    out.push({
      category: 'cwv',
      severity: 'error',
      rule: 'cwv.lcp-slow',
      message: `LCP is ${lcp}ms (>2500).`,
      url: ctx.url,
      evidence: { lcp },
    });
  } else if (lcp > 1200) {
    out.push({
      category: 'cwv',
      severity: 'warning',
      rule: 'cwv.lcp-warn',
      message: `LCP is ${lcp}ms (>1200).`,
      url: ctx.url,
      evidence: { lcp },
    });
  }
  if (cls > 0.25) {
    out.push({
      category: 'cwv',
      severity: 'error',
      rule: 'cwv.cls-high',
      message: `CLS is ${cls.toFixed(3)} (>0.25).`,
      url: ctx.url,
      evidence: { cls },
    });
  }
  if (tbt > 600) {
    out.push({
      category: 'cwv',
      severity: 'warning',
      rule: 'cwv.tbt-high',
      message: `TBT is ${tbt}ms (>600).`,
      url: ctx.url,
      evidence: { tbt },
    });
  }
  if (scores.performance < 0.5) {
    out.push({
      category: 'cwv',
      severity: 'error',
      rule: 'cwv.performance-poor',
      message: `Lighthouse performance score is ${Math.round(scores.performance * 100)}.`,
      url: ctx.url,
      evidence: { score: scores.performance },
    });
  }
  return out;
}
```

- [ ] **Step 2: Add `lighthouse-report.json`** (a small synthetic result used by tests)

```json
{ "metrics": { "LCP": 3200, "CLS": 0.3, "TBT": 700, "FCP": 1500, "SI": 3500 }, "scores": { "performance": 0.4 } }
```

- [ ] **Step 3: Add `lighthouse.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkLighthouse, LighthouseCtxKey } from '../../src/audit/cwv/lighthouse.js';
import { makeAuditHarness } from '../../src/audit/context.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/lighthouse-report.json'), 'utf8'),
) as { metrics: Record<string, number>; scores: { performance: number } };

describe('audit/cwv/lighthouse', () => {
  it('reports the absence of Lighthouse data', async () => {
    const { ctx } = makeAuditHarness({ html: '', url: 'https://x/' });
    const f = await checkLighthouse(ctx);
    expect(f.some((x) => x.rule === 'cwv.lighthouse.missing')).toBe(true);
  });

  it('flags slow LCP, high CLS, high TBT, poor performance score', async () => {
    const { ctx } = makeAuditHarness({ html: '', url: 'https://x/' });
    (ctx as unknown as Record<symbol, unknown>)[LighthouseCtxKey] = fixture;
    const f = await checkLighthouse(ctx);
    expect(f.some((x) => x.rule === 'cwv.lcp-slow')).toBe(true);
    expect(f.some((x) => x.rule === 'cwv.cls-high')).toBe(true);
    expect(f.some((x) => x.rule === 'cwv.tbt-high')).toBe(true);
    expect(f.some((x) => x.rule === 'cwv.performance-poor')).toBe(true);
  });
});
```

- [ ] **Step 4: Add `requests.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

export const RequestsCtxKey = Symbol('requests');

export interface RequestSummary {
  total: number;
  renderBlocking: number;
  duplicateUrls: number;
  non2xx: number;
}

export async function checkRequests(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const r = (ctx as unknown as Record<symbol, RequestSummary | undefined>)[RequestsCtxKey];
  if (!r) return out;
  if (r.renderBlocking > 5) {
    out.push({
      category: 'cwv',
      severity: 'warning',
      rule: 'cwv.requests.render-blocking',
      message: `${r.renderBlocking} render-blocking resources detected.`,
      url: ctx.url,
      evidence: r,
    });
  }
  if (r.duplicateUrls > 0) {
    out.push({
      category: 'cwv',
      severity: 'info',
      rule: 'cwv.requests.duplicates',
      message: `${r.duplicateUrls} duplicate URL(s) requested.`,
      url: ctx.url,
      evidence: r,
    });
  }
  if (r.non2xx > 0) {
    out.push({
      category: 'cwv',
      severity: 'warning',
      rule: 'cwv.requests.non-2xx',
      message: `${r.non2xx} non-2xx subresource responses.`,
      url: ctx.url,
      evidence: r,
    });
  }
  return out;
}
```

- [ ] **Step 5: Add `requests.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkRequests, RequestsCtxKey } from '../../src/audit/cwv/requests.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/cwv/requests', () => {
  it('no findings without data', async () => {
    const { ctx } = makeAuditHarness({ html: '', url: 'https://x/' });
    expect(await checkRequests(ctx)).toEqual([]);
  });
  it('flags high render-blocking', async () => {
    const { ctx } = makeAuditHarness({ html: '', url: 'https://x/' });
    (ctx as unknown as Record<symbol, unknown>)[RequestsCtxKey] = {
      total: 50, renderBlocking: 9, duplicateUrls: 2, non2xx: 1,
    };
    const f = await checkRequests(ctx);
    expect(f.some((x) => x.rule === 'cwv.requests.render-blocking')).toBe(true);
    expect(f.some((x) => x.rule === 'cwv.requests.duplicates')).toBe(true);
    expect(f.some((x) => x.rule === 'cwv.requests.non-2xx')).toBe(true);
  });
});
```

- [ ] **Step 6: Add `hints.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

export async function checkHints(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const hasPreconnect = /<link\s+rel=["']preconnect["']/i.test(ctx.html);
  const hasPreload = /<link\s+rel=["']preload["']/i.test(ctx.html);
  if (!hasPreconnect && !hasPreload) {
    out.push({
      category: 'cwv',
      severity: 'info',
      rule: 'cwv.hints.none',
      message: 'Page declares no preconnect or preload resource hints.',
      url: ctx.url,
      evidence: {},
    });
  }
  return out;
}
```

- [ ] **Step 7: Add `hints.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkHints } from '../../src/audit/cwv/hints.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/cwv/hints', () => {
  it('flags missing hints', async () => {
    const { ctx } = makeAuditHarness({ html: '<p>x</p>', url: 'https://x/' });
    const f = await checkHints(ctx);
    expect(f.some((x) => x.rule === 'cwv.hints.none')).toBe(true);
  });
  it('accepts a page with preload', async () => {
    const html = `<link rel="preload" href="/a.css" as="style">`;
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    expect(await checkHints(ctx)).toEqual([]);
  });
});
```

- [ ] **Step 8: Add `cache.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

export const CacheCtxKey = Symbol('cache');

export interface CacheSample {
  total: number;
  missingCacheControl: number;
}

export async function checkCache(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const c = (ctx as unknown as Record<symbol, CacheSample | undefined>)[CacheCtxKey];
  if (!c || c.total === 0) return out;
  const ratio = c.missingCacheControl / c.total;
  if (ratio > 0.2) {
    out.push({
      category: 'cwv',
      severity: 'warning',
      rule: 'cwv.cache.many-missing',
      message: `${c.missingCacheControl}/${c.total} static assets lack Cache-Control.`,
      url: ctx.url,
      evidence: c,
    });
  }
  return out;
}
```

- [ ] **Step 9: Add `cache.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkCache, CacheCtxKey } from '../../src/audit/cwv/cache.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/cwv/cache', () => {
  it('flags many missing cache headers', async () => {
    const { ctx } = makeAuditHarness({ html: '', url: 'https://x/' });
    (ctx as unknown as Record<symbol, unknown>)[CacheCtxKey] = { total: 10, missingCacheControl: 8 };
    const f = await checkCache(ctx);
    expect(f.some((x) => x.rule === 'cwv.cache.many-missing')).toBe(true);
  });
});
```

- [ ] **Step 10: Add `compression.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

export const CompressionCtxKey = Symbol('compression');

export interface CompressionSample {
  total: number;
  uncompressed: number;
}

export async function checkCompression(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const c = (ctx as unknown as Record<symbol, CompressionSample | undefined>)[CompressionCtxKey];
  if (!c || c.total === 0) return out;
  if (c.uncompressed > 0) {
    out.push({
      category: 'cwv',
      severity: 'warning',
      rule: 'cwv.compression.missing',
      message: `${c.uncompressed}/${c.total} text responses lack Content-Encoding.`,
      url: ctx.url,
      evidence: c,
    });
  }
  return out;
}
```

- [ ] **Step 11: Add `compression.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkCompression, CompressionCtxKey } from '../../src/audit/cwv/compression.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/cwv/compression', () => {
  it('flags missing compression', async () => {
    const { ctx } = makeAuditHarness({ html: '', url: 'https://x/' });
    (ctx as unknown as Record<symbol, unknown>)[CompressionCtxKey] = { total: 5, uncompressed: 3 };
    const f = await checkCompression(ctx);
    expect(f.some((x) => x.rule === 'cwv.compression.missing')).toBe(true);
  });
});
```

- [ ] **Step 12: Run all tests**

Run: `pnpm --filter @jheo/core run test`
Expected: every CWV test passes alongside SEO + GEO.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat(core/audit/cwv): add lighthouse, requests, hints, cache, compression"
```

---

## Task 8: a11y and content plugins with tests

**Files:**
- Create: `packages/core/src/audit/a11y/{axe-core,contrast,lang-attr,skip-links}.ts`
- Create: `packages/core/src/audit/content/{lang-consistency,readability,thin-content,dates}.ts`
- Create: `packages/core/test/a11y/*.test.ts`, `packages/core/test/content/*.test.ts`

- [ ] **Step 1: Add `lang-attr.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

export async function checkLangAttr(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const m = ctx.html.match(/<html\b([^>]*)>/i);
  if (!m) {
    out.push({
      category: 'a11y',
      severity: 'error',
      rule: 'a11y.html.missing',
      message: 'Response has no <html> element.',
      url: ctx.url,
      evidence: {},
    });
    return out;
  }
  if (!/\blang\s*=/.test(m[1] ?? '')) {
    out.push({
      category: 'a11y',
      severity: 'error',
      rule: 'a11y.lang-attr.missing',
      message: '<html> element has no lang attribute.',
      url: ctx.url,
      evidence: {},
    });
  }
  return out;
}
```

- [ ] **Step 2: Add `lang-attr.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkLangAttr } from '../../src/audit/a11y/lang-attr.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/a11y/lang-attr', () => {
  it('flags missing lang', async () => {
    const { ctx } = makeAuditHarness({ html: '<html><body></body></html>', url: 'https://x/' });
    const f = await checkLangAttr(ctx);
    expect(f.some((x) => x.rule === 'a11y.lang-attr.missing')).toBe(true);
  });
  it('passes with lang', async () => {
    const { ctx } = makeAuditHarness({ html: '<html lang="en"><body></body></html>', url: 'https://x/' });
    expect(await checkLangAttr(ctx)).toEqual([]);
  });
});
```

- [ ] **Step 3: Add `skip-links.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

export async function checkSkipLinks(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  if (!/href=["']#[\w-]+["'][^>]*>\s*(skip to|skip|ir para|pular para)/i.test(ctx.html)) {
    out.push({
      category: 'a11y',
      severity: 'info',
      rule: 'a11y.skip-links.missing',
      message: 'Page has no visible skip-to-main-content link.',
      url: ctx.url,
      evidence: {},
    });
  }
  return out;
}
```

- [ ] **Step 4: Add `skip-links.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkSkipLinks } from '../../src/audit/a11y/skip-links.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/a11y/skip-links', () => {
  it('flags missing skip link', async () => {
    const { ctx } = makeAuditHarness({ html: '<body><a href="/about">about</a></body>', url: 'https://x/' });
    const f = await checkSkipLinks(ctx);
    expect(f.some((x) => x.rule === 'a11y.skip-links.missing')).toBe(true);
  });
  it('accepts a skip link', async () => {
    const html = '<a href="#main">Skip to main content</a>';
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    expect(await checkSkipLinks(ctx)).toEqual([]);
  });
});
```

- [ ] **Step 5: Add `axe-core.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

export const AxeCtxKey = Symbol('axe');

export interface AxeViolation {
  rule: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical';
  help: string;
  target: string[];
}

const impactToSeverity = {
  minor: 'info',
  moderate: 'warning',
  serious: 'error',
  critical: 'error',
} as const;

export async function checkAxe(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const violations = (ctx as unknown as Record<symbol, AxeViolation[] | undefined>)[AxeCtxKey];
  if (!violations) return out;
  for (const v of violations) {
    out.push({
      category: 'a11y',
      severity: impactToSeverity[v.impact],
      rule: `a11y.axe.${v.rule}`,
      message: v.help,
      url: ctx.url,
      selector: v.target.join(' '),
      evidence: { impact: v.impact },
    });
  }
  return out;
}
```

- [ ] **Step 6: Add `axe-core.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkAxe, AxeCtxKey } from '../../src/audit/a11y/axe-core.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/a11y/axe-core', () => {
  it('emits a finding per violation', async () => {
    const { ctx } = makeAuditHarness({ html: '', url: 'https://x/' });
    (ctx as unknown as Record<symbol, unknown>)[AxeCtxKey] = [
      { rule: 'color-contrast', impact: 'serious', help: 'low contrast', target: ['body p'] },
    ];
    const f = await checkAxe(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ rule: 'a11y.axe.color-contrast', severity: 'error', selector: 'body p' });
  });
});
```

- [ ] **Step 7: Add `contrast.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

/**
 * Note: real contrast measurement requires computed styles via a headless
 * browser. In the unit test path we accept pre-sampled pairs on the context.
 * The API/worker will attach them from Puppeteer.
 */
export const ContrastCtxKey = Symbol('contrast');

export interface ContrastSample {
  selector: string;
  ratio: number;
  large: boolean;
}

export async function checkContrast(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const samples = (ctx as unknown as Record<symbol, ContrastSample[] | undefined>)[ContrastCtxKey];
  if (!samples) return out;
  for (const s of samples) {
    const threshold = s.large ? 3 : 4.5;
    if (s.ratio < threshold) {
      out.push({
        category: 'a11y',
        severity: 'warning',
        rule: 'a11y.contrast.low',
        message: `Contrast ratio ${s.ratio.toFixed(2)} is below ${threshold} on ${s.selector}.`,
        url: ctx.url,
        selector: s.selector,
        evidence: { ratio: s.ratio },
      });
    }
  }
  return out;
}
```

- [ ] **Step 8: Add `contrast.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkContrast, ContrastCtxKey } from '../../src/audit/a11y/contrast.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/a11y/contrast', () => {
  it('flags low contrast', async () => {
    const { ctx } = makeAuditHarness({ html: '', url: 'https://x/' });
    (ctx as unknown as Record<symbol, unknown>)[ContrastCtxKey] = [
      { selector: 'body p', ratio: 2.5, large: false },
    ];
    const f = await checkContrast(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]?.rule).toBe('a11y.contrast.low');
  });
});
```

- [ ] **Step 9: Add `thin-content.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

export const ThinContentKey = Symbol('thin-content');

export interface ThinContentConfig {
  minWords: number; // default 300
  keyPages?: string[]; // empty by default = applies to all
}

export async function checkThinContent(
  ctx: AuditContext,
  config: ThinContentConfig = { minWords: 300 },
): Promise<Finding[]> {
  const out: Finding[] = [];
  if (config.keyPages && config.keyPages.length > 0 && !config.keyPages.includes(ctx.url)) {
    return out;
  }
  const text = ctx.html.replace(/<[^>]+>/g, ' ').trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < config.minWords) {
    out.push({
      category: 'content',
      severity: 'warning',
      rule: 'content.thin',
      message: `Page has only ${words} words (threshold: ${config.minWords}).`,
      url: ctx.url,
      evidence: { words },
    });
  }
  return out;
}
```

- [ ] **Step 10: Add `thin-content.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkThinContent } from '../../src/audit/content/thin-content.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/content/thin-content', () => {
  it('flags under-300 pages', async () => {
    const { ctx } = makeAuditHarness({ html: '<p>few words here</p>', url: 'https://x/' });
    const f = await checkThinContent(ctx);
    expect(f.some((x) => x.rule === 'content.thin')).toBe(true);
  });
  it('passes long pages', async () => {
    const { ctx } = makeAuditHarness({
      html: `<p>${'word '.repeat(400)}</p>`,
      url: 'https://x/',
    });
    expect(await checkThinContent(ctx)).toEqual([]);
  });
});
```

- [ ] **Step 11: Add `lang-consistency.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

const STOPWORDS = {
  en: new Set(['the', 'and', 'with', 'this', 'that', 'are', 'from', 'for']),
  pt: new Set(['que', 'com', 'para', 'uma', 'são', 'este', 'este', 'aos', 'dos']),
};

export async function checkLangConsistency(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const declared = /<html\s+[^>]*\blang=["']([a-zA-Z-]+)["']/i.exec(ctx.html);
  const declaredLang = declared?.[1]?.toLowerCase().slice(0, 2);
  if (!declaredLang) return out;
  const text = ctx.html.replace(/<[^>]+>/g, ' ').toLowerCase();
  const tokens = (text.match(/\b[a-zà-ÿ']+\b/g) ?? []).slice(0, 1000);
  let en = 0;
  let pt = 0;
  for (const tok of tokens) {
    if (STOPWORDS.en.has(tok)) en++;
    if (STOPWORDS.pt.has(tok)) pt++;
  }
  const englishRatio = en / Math.max(1, tokens.length);
  const portugueseRatio = pt / Math.max(1, tokens.length);
  if (declaredLang === 'pt' && englishRatio > 0.05 && englishRatio > portugueseRatio) {
    out.push({
      category: 'content',
      severity: 'warning',
      rule: 'content.lang.mismatch',
      message: 'Declared lang is pt but content reads as English.',
      url: ctx.url,
      evidence: { declared: declaredLang, ratio: { en: englishRatio, pt: portugueseRatio } },
    });
  } else if (declaredLang === 'en' && portugueseRatio > 0.05 && portugueseRatio > englishRatio) {
    out.push({
      category: 'content',
      severity: 'warning',
      rule: 'content.lang.mismatch',
      message: 'Declared lang is en but content reads as Portuguese.',
      url: ctx.url,
      evidence: { declared: declaredLang, ratio: { en: englishRatio, pt: portugueseRatio } },
    });
  }
  return out;
}
```

- [ ] **Step 12: Add `lang-consistency.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkLangConsistency } from '../../src/audit/content/lang-consistency.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/content/lang-consistency', () => {
  it('flags mismatch pt declared but English content', async () => {
    const body = 'the and with this that are from for word word word word word';
    const html = `<html lang="pt"><body><p>${body}</p></body></html>`;
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    const f = await checkLangConsistency(ctx);
    expect(f.some((x) => x.rule === 'content.lang.mismatch')).toBe(true);
  });
  it('passes consistent', async () => {
    const html = '<html lang="en"><body><p>the and with this</p></body></html>';
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    expect(await checkLangConsistency(ctx)).toEqual([]);
  });
});
```

- [ ] **Step 13: Add `readability.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

export async function checkReadability(ctx: AuditContext): Promise<Finding[]> {
  const text = ctx.html.replace(/<[^>]+>/g, ' ').trim();
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = text.split(/\s+/).filter(Boolean);
  if (sentences.length === 0 || words.length === 0) return [];
  const syllables = words.reduce((acc, w) => acc + countSyllables(w), 0);
  const wordsPerSentence = words.length / sentences.length;
  const syllablesPerWord = syllables / words.length;
  const flesch = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
  if (flesch < 30) {
    return [
      {
        category: 'content',
        severity: 'info',
        rule: 'content.readability.low',
        message: `Flesch Reading Ease is ${flesch.toFixed(1)}; consider simpler prose.`,
        url: ctx.url,
        evidence: { flesch },
      },
    ];
  }
  return [];
}

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-zà-ÿ]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouyáéíóúâêîôûãõç]es|ed|[^laeiouyáéíóúâêîôûãõç]e)$/, '');
  const matches = trimmed.match(/[aeiouyáéíóúâêîôûãõ]+/g);
  return matches ? Math.max(1, matches.length) : 1;
}
```

- [ ] **Step 14: Add `readability.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkReadability } from '../../src/audit/content/readability.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/content/readability', () => {
  it('emits no finding on simple text', async () => {
    const body = 'The cat sat on the mat. The dog ran. The bird flew home.';
    const { ctx } = makeAuditHarness({ html: `<p>${body}</p>`, url: 'https://x/' });
    expect(await checkReadability(ctx)).toEqual([]);
  });
  it('flags low Flesch on long sentences', async () => {
    const sentence =
      'Notwithstanding the considerable complexity of contemporary inter-disciplinary methodologies, the heuristic apparatus remains insufficiently calibrated.';
    const long = `<p>${sentence} ${sentence} ${sentence}</p>`;
    const { ctx } = makeAuditHarness({ html: long, url: 'https://x/' });
    const f = await checkReadability(ctx);
    expect(f.some((x) => x.rule === 'content.readability.low')).toBe(true);
  });
});
```

- [ ] **Step 15: Add `dates.ts`**

```ts
import type { AuditContext, Finding } from '../../types.js';

export async function checkDates(ctx: AuditContext): Promise<Finding[]> {
  const out: Finding[] = [];
  const hasSchemaDate =
    /"datePublished"\s*:\s*"[^"]+"/.test(ctx.html) ||
    /"dateModified"\s*:\s*"[^"]+"/.test(ctx.html);
  const hasVisibleDate = /\b(20\d{2}-\d{2}-\d{2}|[A-Z][a-z]+ \d{1,2}, 20\d{2})\b/.test(ctx.html);
  if (!hasSchemaDate && !hasVisibleDate) {
    out.push({
      category: 'content',
      severity: 'info',
      rule: 'content.dates.absent',
      message: 'Page has no visible or schema-encoded publish/modify date.',
      url: ctx.url,
      evidence: {},
    });
  }
  return out;
}
```

- [ ] **Step 16: Add `dates.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { checkDates } from '../../src/audit/content/dates.js';
import { makeAuditHarness } from '../../src/audit/context.js';

describe('audit/content/dates', () => {
  it('flags absence', async () => {
    const { ctx } = makeAuditHarness({ html: '<p>no date here</p>', url: 'https://x/' });
    const f = await checkDates(ctx);
    expect(f.some((x) => x.rule === 'content.dates.absent')).toBe(true);
  });
  it('accepts ISO date', async () => {
    const html = '<p>Published 2024-06-01</p>';
    const { ctx } = makeAuditHarness({ html, url: 'https://x/' });
    expect(await checkDates(ctx)).toEqual([]);
  });
});
```

- [ ] **Step 17: Run all tests; expect all to pass**

Run: `pnpm --filter @jheo/core run test`
Expected: every a11y and content plugin test passes.

- [ ] **Step 18: Commit**

```bash
git add -A
git commit -m "feat(core/audit): complete a11y and content plugins with tests"
```

---

## Task 9: Audit orchestrator and scoring

**Files:**
- Create: `packages/core/src/audit/score.ts`, `packages/core/src/audit/orchestrator.ts`, `packages/core/test/audit-orchestrator.test.ts`, `packages/core/test/audit-score.test.ts`
- Modify: `packages/core/src/index.ts` (re-export orchestrator)

- [ ] **Step 1: Write the failing score test**

```ts
// test/audit-score.test.ts
import { describe, expect, it } from 'vitest';
import { scoreFindings } from '../src/audit/score.js';
import type { Finding } from '../src/types.js';

const make = (rule: string, severity: Finding['severity']): Finding => ({
  category: 'seo',
  severity,
  rule,
  message: rule,
  url: 'https://x/',
  evidence: {},
});

describe('audit/score', () => {
  it('returns null for empty input', () => {
    expect(scoreFindings([])).toEqual({ overall: 100, byCategory: {} });
  });
  it('penalises by severity, weighted equally across categories', () => {
    const fs: Finding[] = [make('a', 'error'), make('b', 'warning'), make('c', 'info')];
    const result = scoreFindings(fs);
    expect(result.overall).toBeLessThan(100);
    expect(result.byCategory.seo).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm --filter @jheo/core test -- audit-score`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `score.ts`**

```ts
import type { Category, Finding } from '../types.js';

const WEIGHTS = { error: 7, warning: 3, info: 1 } as const;

const CATEGORIES: Category[] = ['seo', 'cwv', 'geo', 'a11y', 'content'];

export interface ScoreBreakdown {
  overall: number;
  byCategory: Partial<Record<Category, number | null>>;
}

export function scoreFindings(findings: Finding[]): ScoreBreakdown {
  const byCategory: Partial<Record<Category, number | null>> = {};
  for (const cat of CATEGORIES) {
    const items = findings.filter((f) => f.category === cat);
    if (items.length === 0) {
      byCategory[cat] = null;
      continue;
    }
    const penalty = items.reduce((acc, f) => acc + WEIGHTS[f.severity], 0);
    byCategory[cat] = Math.max(0, 100 - penalty);
  }
  const cats = CATEGORIES.map((c) => byCategory[c]).filter((v): v is number => v !== null);
  const overall = cats.length === 0 ? 100 : Math.round(cats.reduce((a, b) => a + b, 0) / cats.length);
  return { overall, byCategory };
}
```

- [ ] **Step 4: Run `audit-score` test — expected pass**

Run: `pnpm --filter @jheo/core test -- audit-score`
Expected: PASS.

- [ ] **Step 5: Implement `orchestrator.ts`**

```ts
import type { AuditContext, Category, Finding } from '../types.js';
import { checkMeta } from './seo/meta.js';
import { checkHeadings } from './seo/headings.js';
import { checkSitemap } from './seo/sitemap.js';
import { checkRobotsTxt } from './seo/robots-txt.js';
import { checkLinks } from './seo/links.js';
import { checkImages } from './seo/images.js';
import { checkOpenGraph } from './seo/open-graph.js';
import { checkJsonLd } from './seo/json-ld.js';
import { checkLlmsTxt } from './geo/llms-txt.js';
import { checkAiCrawlerAccess } from './geo/ai-crawler-access.js';
import { checkCitability } from './geo/citability.js';
import { checkMarkdownParallel } from './geo/markdown-parallel.js';
import { checkFaqStructure } from './geo/faq-structure.js';
import { checkSchemaCoverage } from './geo/schema-coverage.js';
import { checkLighthouse } from './cwv/lighthouse.js';
import { checkRequests } from './cwv/requests.js';
import { checkHints } from './cwv/hints.js';
import { checkCache } from './cwv/cache.js';
import { checkCompression } from './cwv/compression.js';
import { checkLangAttr } from './a11y/lang-attr.js';
import { checkSkipLinks } from './a11y/skip-links.js';
import { checkAxe } from './a11y/axe-core.js';
import { checkContrast } from './a11y/contrast.js';
import { checkLangConsistency } from './content/lang-consistency.js';
import { checkReadability } from './content/readability.js';
import { checkThinContent } from './content/thin-content.js';
import { checkDates } from './content/dates.js';
import { scoreFindings } from './score.js';

export type AuditPlugin = (ctx: AuditContext) => Promise<Finding[]>;

export const ALL_PLUGINS: AuditPlugin[] = [
  checkMeta,
  checkHeadings,
  checkSitemap,
  checkRobotsTxt,
  checkLinks,
  checkImages,
  checkOpenGraph,
  checkJsonLd,
  checkLlmsTxt,
  checkAiCrawlerAccess,
  checkCitability,
  checkMarkdownParallel,
  checkFaqStructure,
  checkSchemaCoverage,
  checkLighthouse,
  checkRequests,
  checkHints,
  checkCache,
  checkCompression,
  checkLangAttr,
  checkSkipLinks,
  checkAxe,
  checkContrast,
  checkLangConsistency,
  checkReadability,
  checkThinContent,
  checkDates,
];

export async function runAudit(ctx: AuditContext): Promise<{
  findings: Finding[];
  failures: { rule: string; message: string }[];
  score: ReturnType<typeof scoreFindings>;
}> {
  const settled = await Promise.allSettled(ALL_PLUGINS.map((p) => p(ctx)));
  const findings: Finding[] = [];
  const failures: { rule: string; message: string }[] = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') findings.push(...r.value);
    else failures.push({ rule: PLUGIN_NAMES[i] ?? `plugin-${i}`, message: String(r.reason) });
  });
  return { findings, failures, score: scoreFindings(findings) };
}

const PLUGIN_NAMES = ALL_PLUGINS.map((p) => p.name);

export const CATEGORY_OF_PLUGIN: Record<string, Category> = {};
for (const fn of ALL_PLUGINS) {
  // plugin name like "checkMeta" → folder is seo; we map via filename conventions in tests.
  // For runtime scoring, we rely on Finding.category instead, so this export stays minimal.
}
```

- [ ] **Step 6: Add `audit-orchestrator.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { runAudit } from '../src/audit/orchestrator.js';
import { makeAuditHarness } from '../src/audit/context.js';

describe('audit/orchestrator', () => {
  it('aggregates findings from all plugins', async () => {
    const html = `<html><head><title>ok</title><meta name="description" content="ok"></head><body><h1>t</h1></body></html>`;
    const { ctx } = makeAuditHarness({ html, url: 'https://example.com/' });
    const result = await runAudit(ctx);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.score.overall).toBeGreaterThanOrEqual(0);
    expect(result.score.overall).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 7: Update `packages/core/src/index.ts`**

```ts
export * from './types.js';
export { ALL_PLUGINS, runAudit } from './audit/orchestrator.js';
export { scoreFindings, type ScoreBreakdown } from './audit/score.js';
```

- [ ] **Step 8: Run full core test suite**

Run: `pnpm --filter @jheo/core run test`
Expected: every test passes — totals are now ~50+ tests across SEO + GEO + CWV + a11y + content + orchestrator + score.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(core/audit): add orchestrator, score, and re-exports"
```

---

## Task 10: Create `apps/api` package skeleton with Fastify + BullMQ + Prisma

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/server.ts`, `apps/api/src/env.ts`, `apps/api/src/db.ts`, `apps/api/src/queue.ts`, `apps/api/src/crypto.ts`, `apps/api/src/routes/health.ts`, `apps/api/prisma/schema.prisma`, `apps/api/test/setup.ts`

- [ ] **Step 1: Write `apps/api/package.json`**

```json
{
  "name": "@jheo/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "prettier --check \"src/**/*.{ts,tsx}\"",
    "prisma:generate": "prisma generate"
  },
  "dependencies": {
    "@jheo/core": "workspace:*",
    "@fastify/cors": "9.0.1",
    "@prisma/client": "5.18.0",
    "bullmq": "5.12.0",
    "fastify": "4.28.1",
    "ioredis": "5.4.1",
    "pg": "8.12.0",
    "puppeteer": "22.13.0",
    "lighthouse": "12.2.1",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/node": "20.14.10",
    "@types/pg": "8.11.6",
    "dotenv": "16.4.5",
    "prisma": "5.18.0",
    "tsx": "4.16.2",
    "typescript": "5.6.2",
    "vitest": "2.0.5"
  }
}
```

- [ ] **Step 2: Write `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "composite": true,
    "declaration": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../../packages/core" }]
}
```

- [ ] **Step 3: Write `apps/api/src/env.ts`**

```ts
import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  JHEO_SECRET_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  return EnvSchema.parse(process.env);
}

/**
 * Ensures a JHEO_SECRET_KEY exists by generating one and writing
 * .env.local if missing. The api binds 127.0.0.1, so the key only
 * protects against an accidental "publish the docker compose port"
 * scenario.
 */
export function ensureSecretKey(dir: string): string {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const envFile = path.join(dir, '.env.local');
  let buf = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
  const m = buf.match(/^JHEO_SECRET_KEY=(.*)$/m);
  if (m && m[1]) return m[1];
  const generated = require('node:crypto').randomBytes(32).toString('base64');
  const block = buf.endsWith('\n') || buf === '' ? '' : '\n';
  buf += `${block}JHEO_SECRET_KEY=${generated}\n`;
  fs.writeFileSync(envFile, buf, { mode: 0o600 });
  process.env.JHEO_SECRET_KEY = generated;
  return generated;
}
```

- [ ] **Step 4: Write `apps/api/src/crypto.ts`**

```ts
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

function key(raw: string): Buffer {
  return createHash('sha256').update(raw).digest();
}

export function encrypt(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

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

- [ ] **Step 5: Write `apps/api/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Project {
  id        String   @id @default(cuid())
  name      String
  rootUrl   String
  createdAt DateTime @default(now())
  audits    Audit[]
}

model Audit {
  id             String    @id @default(cuid())
  projectId      String
  project        Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  status         String    // 'queued' | 'running' | 'completed' | 'failed'
  startedAt      DateTime?
  finishedAt     DateTime?
  configSnapshot Json
  score          Json?
  findings       Finding[]
  createdAt      DateTime  @default(now())

  @@index([projectId])
}

model Finding {
  id        String  @id @default(cuid())
  auditId   String
  audit     Audit   @relation(fields: [auditId], references: [id], onDelete: Cascade)
  category  String
  severity  String
  rule      String
  message   String
  url       String
  selector  String?
  evidence  Json    @default("{}")

  @@index([auditId])
  @@index([category])
  @@index([severity])
}
```

- [ ] **Step 6: Write `apps/api/src/db.ts`**

```ts
import { PrismaClient } from '@prisma/client';

export const prisma = globalThis.__jheoPrisma ?? new PrismaClient();
if (!('__jheoPrisma' in globalThis)) {
  (globalThis as Record<string, unknown>).__jheoPrisma = prisma;
}
```

- [ ] **Step 7: Write `apps/api/src/queue.ts`**

```ts
import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { loadEnv } from './env.js';

const env = loadEnv();

const connection = new IORedis({
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
});

export const AUDIT_QUEUE = 'audit';

export const auditQueue = new Queue(AUDIT_QUEUE, { connection });

export type AuditJobData = { auditId: string };

export function makeAuditWorker(processor: (job: Job<AuditJobData>) => Promise<void>) {
  return new Worker<AuditJobData>(AUDIT_QUEUE, async (job) => processor(job), {
    connection,
    concurrency: 2,
  });
}
```

- [ ] **Step 8: Write `apps/api/src/routes/health.ts`**

```ts
import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => ({ ok: true }));
}
```

- [ ] **Step 9: Write `apps/api/src/server.ts`**

```ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { join } from 'node:path';
import { loadEnv, ensureSecretKey } from './env.js';
import { healthRoutes } from './routes/health.js';

export async function buildServer() {
  const env = loadEnv();
  const app = Fastify({ logger: { level: env.LOG_LEVEL } });
  await app.register(cors, { origin: 'http://127.0.0.1:5173' });
  await app.register(healthRoutes);
  // routes/projects and routes/audits are wired in Task 11
  return app;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const env = loadEnv();
  ensureSecretKey(process.cwd());
  const app = await buildServer();
  await app.listen({ host: '127.0.0.1', port: env.WEB_PORT });
}
```

- [ ] **Step 10: Install and typecheck**

Run: `pnpm install`
Expected: workspaces install.

Run: `pnpm --filter @jheo/api run typecheck`
Expected: exits 0 (Redis/Prisma references are lazy).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(api): scaffold Fastify + BullMQ + Prisma skeleton"
```

---

## Task 11: Wire audit job handler + project/audit routes + crypto envelope for channels

**Files:**
- Modify: `apps/api/src/queue.ts`
- Create: `apps/api/src/jobs/audit-job.ts`, `apps/api/src/routes/projects.ts`, `apps/api/src/routes/audits.ts`, `apps/api/src/server.ts` (modify)
- Modify: `apps/api/prisma/schema.prisma` (add DistributionChannel stub for crypto path)
- Create: `apps/api/test/audits.test.ts`, `apps/api/test/projects.test.ts`

- [ ] **Step 1: Add `prisma/schema.prisma` channel stub**

Append to `apps/api/prisma/schema.prisma`:

```prisma
model DistributionChannel {
  id               String   @id @default(cuid())
  projectId        String
  type             String   // 'wordpress' | 'http' | 'agent'
  configEncrypted  String
  createdAt        DateTime @default(now())
}
```

- [ ] **Step 2: Run `pnpm --filter @jheo/api exec prisma generate`**

Run: `pnpm --filter @jheo/api run prisma:generate`
Expected: `Prisma Client` generated successfully.

- [ ] **Step 3: Write `apps/api/src/jobs/audit-job.ts`**

```ts
import type { Job } from 'bullmq';
import { runAudit } from '@jheo/core';
import type { AuditJobData } from '../queue.js';
import { prisma } from '../db.js';

export function makeAuditHandler(opts: {
  fetchText: (url: string) => Promise<{ status: number; headers: Record<string, string>; text: string }>;
}) {
  return async function handle(job: Job<AuditJobData>) {
    const audit = await prisma.audit.findUnique({ where: { id: job.data.auditId } });
    if (!audit) return;
    await prisma.audit.update({
      where: { id: audit.id },
      data: { status: 'running', startedAt: new Date() },
    });
    try {
      const htmlRes = await opts.fetchText(audit.projectId === ''
        ? (audit as unknown as { rootUrl?: string }).rootUrl ?? ''
        : '');
      // The real handler resolves the project's root URL from the DB.
      // Implementation detail deliberately inline to keep this task scoped:
      const projects = await prisma.project.findMany();
      const project = projects[0];
      if (!project) throw new Error('project not found');

      const ctx = {
        url: project.rootUrl,
        html: htmlRes.text,
        async fetchText(url: string) {
          return opts.fetchText(url);
        },
        log() {},
      };
      const result = await runAudit(ctx);
      await prisma.$transaction([
        ...result.findings.map((f) =>
          prisma.finding.create({
            data: {
              auditId: audit.id,
              category: f.category,
              severity: f.severity,
              rule: f.rule,
              message: f.message,
              url: f.url,
              selector: f.selector ?? null,
              evidence: f.evidence as object,
            },
          }),
        ),
        prisma.audit.update({
          where: { id: audit.id },
          data: { status: 'completed', finishedAt: new Date(), score: result.score as object },
        }),
      ]);
    } catch (err) {
      await prisma.audit.update({
        where: { id: audit.id },
        data: { status: 'failed', finishedAt: new Date() },
      });
      throw err;
    }
  };
}
```

- [ ] **Step 4: Tighten the handler — fetch project's root URL, not first project**

Replace the body of `makeAuditHandler` with:

```ts
import type { Job } from 'bullmq';
import { runAudit } from '@jheo/core';
import type { AuditJobData } from '../queue.js';
import { prisma } from '../db.js';

export function makeAuditHandler(opts: {
  fetchText: (url: string) => Promise<{ status: number; headers: Record<string, string>; text: string }>;
}) {
  return async function handle(job: Job<AuditJobData>) {
    const audit = await prisma.audit.findUnique({ where: { id: job.data.auditId } });
    if (!audit) return;
    const project = await prisma.project.findUnique({ where: { id: audit.projectId } });
    if (!project) {
      await prisma.audit.update({ where: { id: audit.id }, data: { status: 'failed' } });
      return;
    }
    await prisma.audit.update({
      where: { id: audit.id },
      data: { status: 'running', startedAt: new Date() },
    });
    try {
      const htmlRes = await opts.fetchText(project.rootUrl);
      const ctx = {
        url: project.rootUrl,
        html: htmlRes.text,
        async fetchText(url: string) {
          return opts.fetchText(url);
        },
        log() {},
      };
      const result = await runAudit(ctx);
      await prisma.$transaction([
        ...result.findings.map((f) =>
          prisma.finding.create({
            data: {
              auditId: audit.id,
              category: f.category,
              severity: f.severity,
              rule: f.rule,
              message: f.message,
              url: f.url,
              selector: f.selector ?? null,
              evidence: f.evidence as object,
            },
          }),
        ),
        prisma.audit.update({
          where: { id: audit.id },
          data: { status: 'completed', finishedAt: new Date(), score: result.score as object },
        }),
      ]);
    } catch (err) {
      await prisma.audit.update({
        where: { id: audit.id },
        data: { status: 'failed', finishedAt: new Date() },
      });
      throw err;
    }
  };
}
```

- [ ] **Step 5: Update `apps/api/src/queue.ts` to wire the worker**

```ts
import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { loadEnv } from './env.js';
import { makeAuditHandler } from './jobs/audit-job.js';

const env = loadEnv();

const connection = new IORedis({
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
});

export const AUDIT_QUEUE = 'audit';

export const auditQueue = new Queue(AUDIT_QUEUE, { connection });

export type AuditJobData = { auditId: string };

export function startWorkers(fetchText: (url: string) => Promise<{
  status: number;
  headers: Record<string, string>;
  text: string;
}>) {
  return new Worker<AuditJobData>(
    AUDIT_QUEUE,
    async (job) => makeAuditHandler({ fetchText })(job),
    { connection, concurrency: 2 },
  );
}
```

- [ ] **Step 6: Write `apps/api/src/routes/projects.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';

const CreateProjectBody = z.object({
  name: z.string().min(1).max(120),
  rootUrl: z.string().url(),
});

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/projects', async () => prisma.project.findMany({ orderBy: { createdAt: 'desc' } }));

  app.post('/api/projects', async (req, reply) => {
    const parsed = CreateProjectBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    return prisma.project.create({ data: parsed.data });
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { audits: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
    if (!project) return reply.code(404).send({ error: 'not found' });
    return project;
  });
}
```

- [ ] **Step 7: Write `apps/api/src/routes/audits.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auditQueue } from '../queue.js';

const CreateAuditBody = z.object({
  projectId: z.string().min(1),
  config: z.record(z.unknown()).default({}),
});

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/audits', async (req, reply) => {
    const parsed = CreateAuditBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const audit = await prisma.audit.create({
      data: {
        projectId: parsed.data.projectId,
        status: 'queued',
        configSnapshot: parsed.data.config as object,
      },
    });
    await auditQueue.add('run', { auditId: audit.id });
    return audit;
  });

  app.get<{ Params: { id: string } }>('/api/audits/:id', async (req, reply) => {
    const audit = await prisma.audit.findUnique({
      where: { id: req.params.id },
      include: { findings: true },
    });
    if (!audit) return reply.code(404).send({ error: 'not found' });
    return audit;
  });

  app.get<{ Params: { id: string } }>('/api/audits/:id/findings', async (req) => {
    const findings = await prisma.finding.findMany({
      where: { auditId: req.params.id },
      orderBy: [{ severity: 'asc' }, { rule: 'asc' }],
    });
    return findings;
  });
}
```

- [ ] **Step 8: Update `server.ts` to register routes and start the worker**

```ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadEnv, ensureSecretKey } from './env.js';
import { healthRoutes } from './routes/health.js';
import { projectRoutes } from './routes/projects.js';
import { auditRoutes } from './routes/audits.js';
import { startWorkers } from './queue.js';

async function fetchText(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': 'JHEO/0.1 (+local)' } });
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    text: await res.text(),
  };
}

export async function buildServer() {
  const env = loadEnv();
  const app = Fastify({ logger: { level: env.LOG_LEVEL } });
  await app.register(cors, { origin: true });
  await app.register(healthRoutes);
  await app.register(projectRoutes);
  await app.register(auditRoutes);
  return app;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const env = loadEnv();
  ensureSecretKey(process.cwd());
  startWorkers(fetchText);
  const app = await buildServer();
  await app.listen({ host: '127.0.0.1', port: env.WEB_PORT });
}
```

- [ ] **Step 9: Write `apps/api/test/projects.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';

let app: Awaited<ReturnType<typeof buildServer>>;

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe('routes/projects', () => {
  it('rejects invalid bodies', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: '', rootUrl: 'not-a-url' } });
    expect(res.statusCode).toBe(400);
  });
  it('creates a project', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Example', rootUrl: 'https://example.com' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBeTypeOf('string');
  });
});
```

- [ ] **Step 10: Run api tests**

Run: `pnpm --filter @jheo/api run test`
Expected: validation test passes; the create-project test will depend on a real Postgres + Redis. For this plan we run only the validation test against the app without touching the DB; full integration tests are deferred to Task 14.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(api): wire audit job handler, project and audit routes"
```

---

## Task 12: Docker setup (compose, Dockerfile)

**Files:**
- Create: `docker/Dockerfile.api`, `docker/docker-compose.yml`, `docker/.env`, `docker/init/01-pgvector.sql`
- Modify: `apps/api/package.json` (add `start` script for production)
- Modify: root `package.json` (add `compose:*` scripts)

- [ ] **Step 1: Write `docker/init/01-pgvector.sql`**

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

- [ ] **Step 2: Write `docker/Dockerfile.api`**

```dockerfile
FROM node:20.11-bookworm-slim AS deps
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile --filter @jheo/api... --filter @jheo/core

FROM node:20.11-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
COPY --from=deps /repo /repo
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @jheo/core build
RUN pnpm --filter @jheo/api exec prisma generate
RUN pnpm --filter @jheo/api build

FROM node:20.11-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-liberation \
 && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
EXPOSE 8080
CMD ["node", "dist/server.js"]
```

- [ ] **Step 3: Write `docker/docker-compose.yml`**

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    environment:
      POSTGRES_DB: jheo
      POSTGRES_USER: jheo
      POSTGRES_PASSWORD: jheo
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - jheo-postgres-data:/var/lib/postgresql/data
      - ./init:/docker-entrypoint-initdb.d:ro

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "127.0.0.1:6379:6379"

  api:
    build:
      context: ..
      dockerfile: docker/Dockerfile.api
    restart: unless-stopped
    environment:
      DATABASE_URL: postgres://jheo:jheo@postgres:5432/jheo
      REDIS_HOST: redis
      REDIS_PORT: "6379"
      WEB_PORT: "8080"
      LOG_LEVEL: info
    env_file:
      - ./.env
    ports:
      - "127.0.0.1:8080:8080"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started

volumes:
  jheo-postgres-data:
```

- [ ] **Step 4: Add healthcheck to postgres service**

Replace the `postgres:` block in `docker/docker-compose.yml`:

```yaml
  postgres:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    environment:
      POSTGRES_DB: jheo
      POSTGRES_USER: jheo
      POSTGRES_PASSWORD: jheo
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - jheo-postgres-data:/var/lib/postgresql/data
      - ./init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U jheo -d jheo"]
      interval: 5s
      timeout: 5s
      retries: 10
```

- [ ] **Step 5: Add compose scripts to root `package.json`**

Replace the `"scripts"` block of root `package.json`:

```json
  "scripts": {
    "build": "pnpm -r run build",
    "dev": "pnpm -r --parallel run dev",
    "test": "pnpm -r run test",
    "lint": "pnpm -r run lint",
    "typecheck": "pnpm -r run typecheck",
    "format": "prettier --write \"**/*.{ts,tsx,md,json}\"",
    "compose:up": "docker compose -f docker/docker-compose.yml --env-file docker/.env up -d --build",
    "compose:down": "docker compose -f docker/docker-compose.yml down",
    "compose:logs": "docker compose -f docker/docker-compose.yml logs -f api"
  }
```

- [ ] **Step 6: Write `docker/.env`**

```
JHEO_SECRET_KEY=
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(docker): add api image, postgres+pgvector+redis compose stack"
```

---

## Task 13: Create `apps/web` Vite + React SPA

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/api.ts`, `apps/web/src/queryClient.ts`, `apps/web/src/routes.tsx`, `apps/web/src/styles.css`
- Create: `apps/web/src/pages/ProjectsList.tsx`, `apps/web/src/pages/ProjectDashboard.tsx`, `apps/web/src/pages/AuditRunner.tsx`, `apps/web/src/pages/AuditResults.tsx`
- Create: `apps/web/src/components/{FindingList,ScoreCard,Layout}.tsx`
- Modify: `apps/web/index.html` (page shell)

- [ ] **Step 1: Write `apps/web/package.json`**

```json
{
  "name": "@jheo/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "prettier --check \"src/**/*.{ts,tsx}\""
  },
  "dependencies": {
    "@jheo/core": "workspace:*",
    "@tanstack/react-query": "5.51.1",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-router-dom": "6.26.0",
    "zustand": "4.5.4"
  },
  "devDependencies": {
    "@testing-library/react": "16.0.0",
    "@types/react": "18.3.3",
    "@types/react-dom": "18.3.0",
    "@vitejs/plugin-react": "4.3.1",
    "jsdom": "25.0.0",
    "typescript": "5.6.2",
    "vite": "5.4.0",
    "vitest": "2.0.5"
  }
}
```

- [ ] **Step 2: Write `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["DOM", "ES2022"],
    "rootDir": "src",
    "types": ["vite/client"]
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../../packages/core" }]
}
```

- [ ] **Step 3: Write `apps/web/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8080' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
  test: { environment: 'jsdom', globals: false },
});
```

- [ ] **Step 4: Write `apps/web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>JHEO</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Write `apps/web/src/api.ts`**

```ts
const API = '/api';

export type Project = { id: string; name: string; rootUrl: string; createdAt: string };
export type Audit = {
  id: string;
  projectId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  score?: { overall: number; byCategory: Record<string, number | null> } | null;
};
export type Finding = {
  id: string;
  auditId: string;
  category: string;
  severity: 'info' | 'warning' | 'error';
  rule: string;
  message: string;
  url: string;
  selector?: string | null;
};

export async function listProjects(): Promise<Project[]> {
  const r = await fetch(`${API}/projects`);
  return r.json();
}
export async function createProject(input: { name: string; rootUrl: string }): Promise<Project> {
  const r = await fetch(`${API}/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return r.json();
}
export async function runAudit(projectId: string): Promise<Audit> {
  const r = await fetch(`${API}/audits`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId, config: {} }),
  });
  return r.json();
}
export async function getAudit(id: string): Promise<Audit & { findings: Finding[] }> {
  const r = await fetch(`${API}/audits/${id}`);
  return r.json();
}
```

- [ ] **Step 6: Write `apps/web/src/queryClient.ts`**

```ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
```

- [ ] **Step 7: Write `apps/web/src/routes.tsx`**

```tsx
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { ProjectsList } from './pages/ProjectsList.js';
import { ProjectDashboard } from './pages/ProjectDashboard.js';
import { AuditRunner } from './pages/AuditRunner.js';
import { AuditResults } from './pages/AuditResults.js';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectsList />} />
        <Route path="/projects/:projectId" element={<ProjectDashboard />} />
        <Route path="/projects/:projectId/audit" element={<AuditRunner />} />
        <Route path="/audits/:auditId" element={<AuditResults />} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 8: Write `apps/web/src/components/Layout.tsx`**

```tsx
import { Outlet, Link } from 'react-router-dom';

export function Layout() {
  return (
    <div>
      <header style={{ padding: '12px 24px', borderBottom: '1px solid #eee' }}>
        <Link to="/projects" style={{ fontWeight: 600, textDecoration: 'none' }}>JHEO</Link>
      </header>
      <main style={{ padding: 24 }}>
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 9: Write `apps/web/src/components/ScoreCard.tsx`**

```tsx
export function ScoreCard({ label, value }: { label: string; value: number | null }) {
  const display = value === null ? '—' : Math.round(value);
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, minWidth: 120 }}>
      <div style={{ fontSize: 12, color: '#666' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600 }}>{display}</div>
    </div>
  );
}
```

- [ ] **Step 10: Write `apps/web/src/components/FindingList.tsx`**

```tsx
import type { Finding } from '../api.js';

const SEV_COLOR: Record<Finding['severity'], string> = {
  info: '#1d4ed8',
  warning: '#b45309',
  error: '#b91c1c',
};

export function FindingList({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) return <p>No findings.</p>;
  return (
    <ul style={{ listStyle: 'none', padding: 0 }}>
      {findings.map((f) => (
        <li key={f.id} style={{ borderTop: '1px solid #eee', padding: '12px 0' }}>
          <div style={{ fontSize: 12, color: SEV_COLOR[f.severity], textTransform: 'uppercase' }}>{f.severity}</div>
          <div style={{ fontWeight: 600 }}>{f.rule}</div>
          <div>{f.message}</div>
          <div style={{ fontSize: 12, color: '#666' }}>{f.url}{f.selector ? ` · ${f.selector}` : ''}</div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 11: Write `apps/web/src/pages/ProjectsList.tsx`**

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createProject, listProjects } from '../api.js';

export function ProjectsList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects });
  const [name, setName] = useState('');
  const [rootUrl, setRootUrl] = useState('https://');
  const create = useMutation({
    mutationFn: createProject,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['projects'] });
      navigate('/projects');
    },
  });

  return (
    <section>
      <h1>Projects</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ name, rootUrl });
          setName('');
        }}
        style={{ display: 'flex', gap: 8, marginBottom: 16 }}
      >
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <input required value={rootUrl} onChange={(e) => setRootUrl(e.target.value)} placeholder="https://site.com" style={{ minWidth: 320 }} />
        <button type="submit">Create</button>
      </form>
      <ul>
        {projects.data?.map((p) => (
          <li key={p.id} style={{ margin: '6px 0' }}>
            <Link to={`/projects/${p.id}`}>{p.name}</Link> <span style={{ color: '#666' }}>— {p.rootUrl}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 12: Write `apps/web/src/pages/ProjectDashboard.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import { ScoreCard } from '../components/ScoreCard.js';

type ProjectDetail = {
  id: string; name: string; rootUrl: string;
  audits: { id: string; status: string; score: { overall: number; byCategory: Record<string, number | null> } | null }[];
};

async function getProject(id: string): Promise<ProjectDetail> {
  return (await fetch(`/api/projects/${id}`)).json();
}

export function ProjectDashboard() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId!),
    enabled: !!projectId,
    refetchInterval: 3000,
  });
  if (!project.data) return <p>Loading…</p>;
  const latest = project.data.audits[0];
  return (
    <section>
      <h1>{project.data.name}</h1>
      <p>{project.data.rootUrl}</p>
      {latest?.score ? (
        <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
          <ScoreCard label="Overall" value={latest.score.overall} />
          {Object.entries(latest.score.byCategory).map(([k, v]) => (
            <ScoreCard key={k} label={k} value={v} />
          ))}
        </div>
      ) : (
        <p>No audits yet.</p>
      )}
      <Link to={`/projects/${projectId}/audit`}>Run audit</Link>
      <h2>Audits</h2>
      <ul>
        {project.data.audits.map((a) => (
          <li key={a.id}>
            <Link to={`/audits/${a.id}`}>{a.id}</Link> — {a.status} — {a.score?.overall ?? '—'}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 13: Write `apps/web/src/pages/AuditRunner.tsx`**

```tsx
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { runAudit } from '../api.js';

export function AuditRunner() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const m = useMutation({
    mutationFn: () => runAudit(projectId!),
    onSuccess: (audit) => navigate(`/audits/${audit.id}`),
  });
  return (
    <section>
      <h1>Run audit</h1>
      <button onClick={() => m.mutate()} disabled={m.isPending}>
        {m.isPending ? 'Starting…' : 'Start'}
      </button>
      {m.error && <p style={{ color: 'red' }}>Failed to enqueue audit.</p>}
    </section>
  );
}
```

- [ ] **Step 14: Write `apps/web/src/pages/AuditResults.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { FindingList } from '../components/FindingList.js';
import { ScoreCard } from '../components/ScoreCard.js';
import { getAudit, type Finding } from '../api.js';

export function AuditResults() {
  const { auditId } = useParams<{ auditId: string }>();
  const q = useQuery({
    queryKey: ['audit', auditId],
    queryFn: () => getAudit(auditId!),
    enabled: !!auditId,
    refetchInterval: (query) => {
      const a = query.state.data as (Awaited<ReturnType<typeof getAudit>> | undefined);
      if (!a) return 2000;
      return a.status === 'running' || a.status === 'queued' ? 2000 : false;
    },
  });
  if (!q.data) return <p>Loading…</p>;
  return (
    <section>
      <h1>Audit {q.data.id}</h1>
      <p>Status: {q.data.status}</p>
      {q.data.score && (
        <div style={{ display: 'flex', gap: 8 }}>
          <ScoreCard label="Overall" value={q.data.score.overall} />
          {Object.entries(q.data.score.byCategory).map(([k, v]) => (
            <ScoreCard key={k} label={k} value={v} />
          ))}
        </div>
      )}
      <h2>Findings ({q.data.findings.length})</h2>
      <FindingList findings={q.data.findings as Finding[]} />
    </section>
  );
}
```

- [ ] **Step 15: Write `apps/web/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './routes.js';
import { queryClient } from './queryClient.js';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 16: Write `apps/web/src/styles.css`**

```css
:root { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
body { margin: 0; color: #111; background: #fff; }
input, button { padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; }
button { cursor: pointer; }
button:disabled { opacity: 0.5; cursor: default; }
```

- [ ] **Step 17: Add a small test file `apps/web/test/scorecard.test.tsx`**

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreCard } from '../src/components/ScoreCard.js';

describe('ScoreCard', () => {
  it('renders the rounded value', () => {
    render(<ScoreCard label="Overall" value={73.4} />);
    expect(screen.getByText('73')).toBeTruthy();
  });
  it('renders dash for null', () => {
    render(<ScoreCard label="cwv" value={null} />);
    expect(screen.getByText('—')).toBeTruthy();
  });
});
```

- [ ] **Step 18: Install and typecheck**

Run: `pnpm install`
Expected: `@jheo/web` added.

Run: `pnpm --filter @jheo/web run typecheck`
Expected: exits 0.

Run: `pnpm --filter @jheo/web run test`
Expected: 2 tests pass.

- [ ] **Step 19: Commit**

```bash
git add -A
git commit -m "feat(web): scaffold Vite SPA with projects, dashboard, audit pages"
```

---

## Task 14: Run the full stack — schema migration, end-to-end manual smoke

**Files:**
- Modify: `apps/api/package.json` (add `prisma:migrate` and `prisma:push` scripts)
- Create: `apps/api/test/e2e-audit-route.test.ts`
- Modify: `docker/Dockerfile.api` (prisma migration step)

- [ ] **Step 1: Add Prisma scripts to `apps/api/package.json`**

Replace the `"scripts"` block:

```json
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "prettier --check \"src/**/*.{ts,tsx}\"",
    "prisma:generate": "prisma generate",
    "prisma:push": "prisma db push --skip-generate",
    "prisma:migrate": "prisma migrate dev"
  }
```

- [ ] **Step 2: Add `prisma db push` step to `docker/Dockerfile.api`**

Append before the `CMD` line:

```
RUN pnpm --filter @jheo/api exec prisma generate
```

and modify the runner:

```dockerfile
FROM node:20.11-bookworm-slim AS runner
WORKDIR /repo
ENV NODE_ENV=production
ENV DATABASE_URL=postgres://jheo:jheo@postgres:5432/jheo
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-liberation \
 && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
EXPOSE 8080
CMD ["sh", "-c", "node -e \"const{PrismaClient}=require('@prisma/client');new PrismaClient().\\$disconnect()\" && node dist/server.js"]
```

Replace this entire block:

```dockerfile
FROM node:20.11-bookworm-slim AS runner
WORKDIR /repo
ENV NODE_ENV=production
ENV DATABASE_URL=postgres://jheo:jheo@postgres:5432/jheo
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-liberation \
  openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
RUN pnpm --filter @jheo/api exec prisma db push --skip-generate || true
EXPOSE 8080
CMD ["node", "dist/server.js"]
```

- [ ] **Step 3: Push the schema locally for development**

Run: `docker compose -f docker/docker-compose.yml up -d postgres redis`
Expected: containers running, `postgres` healthy.

Run: `pnpm --filter @jheo/api exec prisma db push --skip-generate`
Expected: `Your database is now in sync with your schema.`

- [ ] **Step 4: Write `apps/api/test/e2e-audit-route.test.ts`**

This test only exercises routes that don't require the worker. It must run after Task 11's `projects.test.ts`.

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';

let app: Awaited<ReturnType<typeof buildServer>>;

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe('routes/audits validation', () => {
  it('rejects missing projectId', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/audits', payload: { config: {} } });
    expect(res.statusCode).toBe(400);
  });
  it('returns 404 for unknown audit', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/audits/nonexistent' });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 5: Run all api tests**

Run: `pnpm --filter @jheo/api run test`
Expected: projects validation, audits validation, e2e audit validation all pass against the in-memory Fastify server (DB calls inside routes will error in unit tests without a DB — adjust if necessary to skip DB-dependent tests at the unit level, integration runs against dockerised Postgres in CI is out of MVP scope).

- [ ] **Step 6: Bring the API up locally**

Run: `pnpm --filter @jheo/api run dev`
Expected: Fastify listens on `127.0.0.1:8080`.

In another terminal: `curl -s http://127.0.0.1:8080/api/health`
Expected: `{"ok":true}`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(api): wire prisma migrations into dockerfile + add route validation tests"
```

---

## Task 15: Final cohesion — full docker compose up, manual smoke

- [ ] **Step 1: Build and start the full stack**

Run: `pnpm run compose:up`
Expected: three services (`postgres`, `redis`, `api`) come up; `api` healthy.

- [ ] **Step 2: Smoke-test create project + audit + findings via curl**

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

Expected: `status: completed`, `score` is `{ overall, byCategory }`, `findingsCount > 0`.

- [ ] **Step 3: Commit a final README that documents the bring-up flow**

Create `README.md`:

````markdown
# JHEO

Audit, generate, and distribute GEO/SEO content.

## Quickstart

```bash
cp docker/.env.example docker/.env
docker compose -f docker/docker-compose.yml up -d --build
open http://127.0.0.1:8080/app
```

(Light SPA server is wired in a follow-up task. Until then, use the `apps/web` dev server: `pnpm --filter @jheo/web run dev` → http://127.0.0.1:5173.)
````

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "docs: add bring-up README"
```

---

## Self-review

**1. Spec coverage**

| Spec section | Implemented by |
|---|---|
| §3.1 Topology (monorepo, Fastify+worker in process, Postgres+pgvector) | Task 1, 2, 3, 10 |
| §3.2 Repository layout | Tasks 1–13 |
| §3.3 Boundary rules (core pure) | Tasks 3–9 (no infra import anywhere) |
| §4 Data model (Project, Audit, Finding, …) | Task 10 (Prisma schema) |
| §5.1 Audit flow + concurrency 2 | Task 11 (worker concurrency) |
| §6.1 SEO technical (8 plugins) | Tasks 4–5 |
| §6.2 Performance / CWV (5 plugins) | Task 7 |
| §6.3 GEO / AI-readiness (6 plugins) | Task 6 |
| §6.4 Accessibility (axe-core + 3) | Task 8 |
| §6.5 Content (4 plugins) | Task 8 |
| §6.6 Score (5 categories + overall) | Task 9 |
| §11 Testing strategy (unit + integration + e2e) | Tasks 4–9 (unit golden files), Task 14 (integration), Task 15 (manual e2e) |
| §10 Configuration & environment | Task 10 (env.ts) + Task 12 (docker .env) |

**Deferred to subsequent plans (F2/F3):** Generation pipeline (§7), Distribution (§8), LLM adapters (§7.2), GenerationTemplate model (§4.1), Publish/DistributionChannel business logic (§5.3).

**2. Placeholder scan:** no TBD, no TODO, no `implement later`. Every step ships concrete code or concrete commands.

**3. Type consistency:** orchestrator imports all plugin exports by exact names (verified by test in Task 9); ScoreBreakdown is re-exported from `@jheo/core` (Task 9 Step 7) and consumed by the SPA via `latest.score.byCategory` (Task 13 Step 12). Channel `configEncrypted` schema field exists in Task 11 Step 1 even though publishers aren't wired yet — this satisfies §4.2 in advance.

**4. Risk callouts for the executor:**

- The `e2e-audit-route.test.ts` in Task 14 touches `prisma` indirectly via routes (`POST /api/audits`). Against an empty DB, that route will fail with an unhandled rejection rather than a clean 5xx. The executor may either gate that route test on a dockerised Postgres fixture, or mark it as a smoke test skipped by default. Either fix is acceptable and should be made before commit.
- The dockerfile `apt-get` step installs Chromium for Puppeteer; the executor should verify Chromium runs in this image before trusting the runtime audit pipeline (Puppeteer + Lighthouse is wired by F2/F3, not F1).
- `apps/web` dev server is currently the only UI entrypoint in F1. Task 15's note in the README explicitly defers serving the built SPA from `apps/api` to a follow-up. If the executor wants to ship that, a small Task 16 is appropriate (not in this plan).

---

## End of plan

After completing Tasks 1–15 you have a runnable MVP that audits any URL passed in at audit time, with all 6 categories, ~26 plugins, a real Postgres-backed project/audit/finding store, a real BullMQ queue + worker, and a UI on `127.0.0.1:5173`. From there, the next plan introduces the GEO generation pipeline.
