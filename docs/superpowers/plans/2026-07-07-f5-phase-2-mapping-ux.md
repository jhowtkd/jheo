# F5 Phase 2 — Mapping UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Project dashboard shows aggregate health (overall + 5 categories), a filterable page table (URL, source, last audited, last score), and a "Re-audit" placeholder button per page (enabled in Phase 4).

**Architecture:** Two new routes in `apps/api/src/routes/projects.ts`: `GET /api/projects/:id/pages` (paginated, filterable) and `GET /api/projects/:id/health` (aggregated from the most recent completed `Audit`). The dashboard consumes both, renders an aggregate card, a filter bar, and a table. `FilterBar` is a new tiny component.

**Tech Stack:** TypeScript strict, Fastify, Prisma, React + TanStack Query, Vite. Existing patterns from F1 dashboard.

## Global Constraints

- TypeScript strict; `pnpm typecheck` must pass after each task.
- Test command: `pnpm test` from repo root.
- Cache-Control on new routes: `pages` → `private, max-age=5`; `health` → `private, max-age=5` (matches Phase 1 `/:id` cache policy of 10s; the new routes are 5s because they aggregate).
- The `health` aggregate is computed from the most recent completed `Audit` (`status: 'completed', orderBy: { finishedAt: 'desc' }`). If none exists, return the null shape documented below.
- `Score` shape: `{ overall: number, byCategory: Record<'seo'|'cwv'|'geo'|'a11y'|'content', number|null> }`. Severities are `info|warning|error` (existing).
- Synthetic `ProjectPage`s (`url` starting with `synthetic://`) are not in Phase 2 — they are introduced in Phase 3, so no filter is needed here.
- Re-audit button per page is **disabled** in Phase 2 with `title="Coming in F5.4"`. Phase 4 unblocks it.

## File Structure

**Modified:**
- `apps/api/src/routes/projects.ts` — adds 2 routes.
- `apps/web/src/api.ts` — adds `ProjectHealth`, `PagesResponse` types.
- `apps/web/src/pages/ProjectDashboard.tsx` — redesign with card + filters + table.
- `apps/web/src/components/ScoreCard.tsx` — null-safe rendering.

**Created:**
- `apps/web/src/components/FilterBar.tsx` — small filter component.
- `apps/api/test/projects.test.ts` — extend with new route tests.

---

## Task 1: Add `GET /api/projects/:id/pages` route

**Files:**
- Modify: `apps/api/src/routes/projects.ts:45-56`
- Test: `apps/api/test/projects.test.ts`

**Interfaces:**
- Consumes: `prisma.projectPage.findMany`
- Produces: `GET /api/projects/:id/pages?limit=50&offset=0&filter=not_audited|with_error|discovered_via:sitemap|crawl|root`

- [ ] **Step 1: Define the Zod schema for query params**

In `apps/api/src/routes/projects.ts`, add above the `projectRoutes` function (around line 19):

```ts
const PagesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  filter: z.enum(['not_audited', 'with_error', 'discovered_via:root', 'discovered_via:sitemap', 'discovered_via:crawl']).optional(),
});
```

`z.coerce.number()` is required because query params are strings.

- [ ] **Step 2: Add the route handler**

In `apps/api/src/routes/projects.ts`, immediately after the existing `app.get('/api/projects/:id', ...)` block (after line 56), add:

```ts
  app.get<{ Params: { id: string }; Querystring: { limit?: string; offset?: string; filter?: string } }>('/api/projects/:id/pages', async (req, reply) => {
    reply.header('cache-control', 'private, max-age=5');
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return reply.code(404).send({ error: 'not found' });

    const parsed = PagesQuery.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const where: { projectId: string; lastAuditedAt?: null | { not: null }; discoveredVia?: string } = {
      projectId: project.id,
    };
    if (parsed.data.filter === 'not_audited') where.lastAuditedAt = null;
    if (parsed.data.filter === 'with_error') where.lastAuditedAt = { not: null };
    if (parsed.data.filter?.startsWith('discovered_via:')) {
      where.discoveredVia = parsed.data.filter.split(':')[1]!;
    }

    const [pages, total] = await Promise.all([
      prisma.projectPage.findMany({
        where,
        orderBy: { url: 'asc' },
        take: parsed.data.limit,
        skip: parsed.data.offset,
        include: {
          pageAudits: {
            where: { status: 'completed' },
            orderBy: { finishedAt: 'desc' },
            take: 1,
            select: { score: true, finishedAt: true },
          },
        },
      }),
      prisma.projectPage.count({ where }),
    ]);

    return {
      total,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
      items: pages.map((p) => ({
        id: p.id,
        url: p.url,
        discoveredVia: p.discoveredVia,
        lastAuditedAt: p.lastAuditedAt,
        lastScore: p.pageAudits[0]?.score ?? null,
      })),
    };
  });
```

The `include: { pageAudits: { where: { status: 'completed' } } }` reads the most recent **completed** `PageAudit.score` for each page. In Phase 2, no `PageAudit` rows exist yet (Phase 3 introduces the table), so `lastScore` will always be `null`. The route is correct forward-compatibly.

- [ ] **Step 3: Add tests in `projects.test.ts`**

Open `apps/api/test/projects.test.ts`. After the existing tests in `describe('routes/projects', ...)`, add:

```ts
  it.runIf(canRunDb)('GET /:id/pages returns paginated list', async () => {
    const created = await app!.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'pages-list', domain: 'example.com' },
    });
    const { id } = created.json();

    const res = await app!.inject({
      method: 'GET',
      url: `/api/projects/${id}/pages?limit=10&offset=0`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ total: expect.any(Number), limit: 10, offset: 0 });
    expect(Array.isArray(body.items)).toBe(true);
  });

  it.runIf(canRunDb)('GET /:id/pages?filter=not_audited returns only un-audited pages', async () => {
    const created = await app!.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'pages-filter', domain: 'example.com' },
    });
    const { id } = created.json();

    const res = await app!.inject({
      method: 'GET',
      url: `/api/projects/${id}/pages?filter=not_audited`,
    });
    expect(res.statusCode).toBe(200);
    for (const item of res.json().items) {
      expect(item.lastAuditedAt).toBeNull();
    }
  });

  it.runIf(canRunDb)('GET /:id/pages returns 404 for unknown project', async () => {
    const res = await app!.inject({ method: 'GET', url: '/api/projects/does-not-exist/pages' });
    expect(res.statusCode).toBe(404);
  });
```

- [ ] **Step 4: Run the new tests**

Run: `pnpm --filter @jheo/api test projects`
Expected: all tests pass (the 2 from Phase 1 + 3 new).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/projects.ts apps/api/test/projects.test.ts
git commit -m "feat(api): GET /api/projects/:id/pages with filters"
```

---

## Task 2: Add `GET /api/projects/:id/health` route

**Files:**
- Modify: `apps/api/src/routes/projects.ts`
- Test: `apps/api/test/projects.test.ts`

**Interfaces:**
- Consumes: `prisma.audit.findFirst` (most recent completed), `prisma.projectPage.count`
- Produces: `GET /api/projects/:id/health`

- [ ] **Step 1: Add the route handler**

In `apps/api/src/routes/projects.ts`, after the new pages route, add:

```ts
  app.get('/api/projects/:id/health', async (req, reply) => {
    reply.header('cache-control', 'private, max-age=5');
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return reply.code(404).send({ error: 'not found' });

    const lastAudit = await prisma.audit.findFirst({
      where: { projectId: project.id, status: 'completed' },
      orderBy: { finishedAt: 'desc' },
    });

    const [pagesTotal, pagesWithError] = await Promise.all([
      prisma.projectPage.count({ where: { projectId: project.id } }),
      prisma.projectPage.count({
        where: {
          projectId: project.id,
          lastAuditedAt: { not: null },
          pageAudits: { some: { status: 'failed' } },
        },
      }),
    ]);

    const score = (lastAudit?.score ?? null) as
      | { overall: number; byCategory: Record<string, number | null>; pagesAudited: number }
      | null;

    return {
      overall: score?.overall ?? null,
      byCategory: score?.byCategory ?? { seo: null, cwv: null, geo: null, a11y: null, content: null },
      pagesAudited: score?.pagesAudited ?? 0,
      pagesTotal,
      pagesWithError,
      lastAuditAt: lastAudit?.finishedAt ?? null,
    };
  });
```

The `pageAudits: { some: { status: 'failed' } }` filter requires the `PageAudit` table from Phase 3. In Phase 2, no `PageAudit` rows exist, so `pagesWithError` will be 0 even if some pages had a `page.unreachable` finding in the Audit. Phase 3 wires this up correctly.

- [ ] **Step 2: Add tests**

In `apps/api/test/projects.test.ts`, after the pages tests, add:

```ts
  it.runIf(canRunDb)('GET /:id/health returns null scores when no audit has run', async () => {
    const created = await app!.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'health-empty', domain: 'example.com' },
    });
    const { id } = created.json();

    const res = await app!.inject({ method: 'GET', url: `/api/projects/${id}/health` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.overall).toBeNull();
    expect(body.byCategory).toEqual({ seo: null, cwv: null, geo: null, a11y: null, content: null });
    expect(body.pagesAudited).toBe(0);
    expect(body.pagesTotal).toBeGreaterThanOrEqual(0);
    expect(body.lastAuditAt).toBeNull();
  });

  it.runIf(canRunDb)('GET /:id/health returns 404 for unknown project', async () => {
    const res = await app!.inject({ method: 'GET', url: '/api/projects/does-not-exist/health' });
    expect(res.statusCode).toBe(404);
  });
```

- [ ] **Step 3: Run the tests**

Run: `pnpm --filter @jheo/api test projects`
Expected: 7+ tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/projects.ts apps/api/test/projects.test.ts
git commit -m "feat(api): GET /api/projects/:id/health aggregate"
```

---

## Task 3: Add web types for pages + health

**Files:**
- Modify: `apps/web/src/api.ts`

**Interfaces:**
- Produces: `ProjectPage` extended with `lastScore: {overall, byCategory}|null`, `PagesResponse`, `ProjectHealth`.

- [ ] **Step 1: Extend `ProjectPage` and add new types**

In `apps/web/src/api.ts`, find the existing `ProjectPage` type (around line 38) and replace with:

```ts
export type PageScore = { overall: number; byCategory: Record<string, number | null> };

export type ProjectPage = {
  id: string;
  url: string;
  discoveredVia: 'root' | 'sitemap' | 'crawl';
  lastAuditedAt: string | null;
  lastScore?: PageScore | null; // populated by /pages route; not by /:id
};

export type PagesResponse = {
  total: number;
  limit: number;
  offset: number;
  items: ProjectPage[];
};

export type ProjectHealth = {
  overall: number | null;
  byCategory: Record<'seo' | 'cwv' | 'geo' | 'a11y' | 'content', number | null>;
  pagesAudited: number;
  pagesTotal: number;
  pagesWithError: number;
  lastAuditAt: string | null;
};
```

This widens the existing `ProjectPage` type (the `pages` from `GET /:id` do not include `lastScore`, so consumers must accept the union). Update the consumers in `apps/web/src/pages/ProjectDashboard.tsx` (next task) to handle `lastScore: null`.

- [ ] **Step 2: Add API client functions**

In `apps/web/src/api.ts`, add (next to the existing `getProject` function):

```ts
export async function getProjectPages(
  id: string,
  opts: { limit?: number; offset?: number; filter?: string } = {},
): Promise<PagesResponse> {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts.offset !== undefined) params.set('offset', String(opts.offset));
  if (opts.filter) params.set('filter', opts.filter);
  const qs = params.toString();
  const res = await fetch(`${apiUrl}/api/projects/${id}/pages${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(`Failed to load pages: ${res.status}`);
  return res.json();
}

export async function getProjectHealth(id: string): Promise<ProjectHealth> {
  const res = await fetch(`${apiUrl}/api/projects/${id}/health`);
  if (!res.ok) throw new Error(`Failed to load health: ${res.status}`);
  return res.json();
}
```

`apiUrl` is the existing constant in `api.ts` (top of file).

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean (consumers not yet updated to new shape, so this catches shape mismatches in existing code that might break).

If a consumer in `ProjectDashboard.tsx` reads `page.lastScore` and the old type did not have it, that consumer will surface a `Property 'lastScore' does not exist` error. The next task redesigns the dashboard to use the new types, so this is fine — it is fixed in the next task. If typecheck fails for any other reason, fix it.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/api.ts
git commit -m "feat(web): add ProjectHealth, PagesResponse, lastScore types"
```

---

## Task 4: Create `FilterBar` component

**Files:**
- Create: `apps/web/src/components/FilterBar.tsx`

**Interfaces:**
- Produces: `<FilterBar value={...} onChange={...} options={[...]} />`

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/FilterBar.tsx` with:

```tsx
export type FilterOption<T extends string> = { value: T; label: string };

interface Props<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: FilterOption<T>[];
}

export function FilterBar<T extends string>({ value, onChange, options }: Props<T>) {
  return (
    <div className="filter-bar" role="tablist" aria-label="Filter">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={opt.value === value}
          className={`filter-bar__chip ${opt.value === value ? 'filter-bar__chip--active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add minimal CSS**

In `apps/web/src/styles.css`, add (anywhere, but ideally grouped with other component styles):

```css
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}
.filter-bar__chip {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--fs-sm);
  transition: all 120ms ease;
}
.filter-bar__chip--active {
  background: var(--accent);
  color: var(--bg);
  border-color: var(--accent);
}
.filter-bar__chip:hover:not(.filter-bar__chip--active) {
  border-color: var(--text-muted);
}
```

If `var(--accent)`, `var(--bg)`, `var(--text-muted)`, `var(--border)`, `var(--radius-pill)`, `var(--space-2)`, `var(--space-3)`, `var(--space-4)`, `var(--fs-sm)`, `var(--bg-elevated)` are not defined in `:root`, add them. The repo already uses a JHEO design system (per commit `faf9a27`); inspect `styles.css` to confirm variable names. If a variable is named differently, use the existing name. Do not invent a new design system.

- [ ] **Step 3: Verify the styles.css has the variables**

Run: `grep -E '(--accent|--bg|--text-muted|--border|--radius-pill|--space|--fs-sm|--bg-elevated)' apps/web/src/styles.css | head -30`

If any variable is missing, add a sensible default in `:root` (e.g. `  --accent: #5b8def;`).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/FilterBar.tsx apps/web/src/styles.css
git commit -m "feat(web): FilterBar component for table filters"
```

---

## Task 5: Redesign `ProjectDashboard.tsx` with health card + filters + table

**Files:**
- Modify: `apps/web/src/pages/ProjectDashboard.tsx`

- [ ] **Step 1: Read the current `ProjectDashboard.tsx` to understand the existing layout**

Open the file. Note the existing route param, the existing `useProject` query, and the existing JSX layout. The redesign must:
- Keep the same route param (`/projects/:id`).
- Use `useProject` for the basic project info.
- Add `useQuery` for `getProjectHealth` and `getProjectPages`.
- Render an aggregate card on top.
- Render `FilterBar` between the card and the table.
- Render a table of pages.
- Sticky footer with `pagesAudited / pagesTotal`.

- [ ] **Step 2: Replace the file contents with the redesign**

Replace the entire `ProjectDashboard.tsx` with:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { getProject, getProjectHealth, getProjectPages } from '../api.js';
import { ScoreCard } from '../components/ScoreCard.js';
import { FilterBar, type FilterOption } from '../components/FilterBar.js';

type FilterValue = 'all' | 'not_audited' | 'with_error' | 'discovered_via:sitemap' | 'discovered_via:crawl' | 'discovered_via:root';

const FILTER_OPTIONS: FilterOption<FilterValue>[] = [
  { value: 'all', label: 'All' },
  { value: 'not_audited', label: 'Not audited' },
  { value: 'with_error', label: 'With error' },
  { value: 'discovered_via:sitemap', label: 'Sitemap' },
  { value: 'discovered_via:crawl', label: 'Crawl' },
  { value: 'discovered_via:root', label: 'Root' },
];

export function ProjectDashboard() {
  const { id } = useParams<{ id: string }>();
  const [filter, setFilter] = useState<FilterValue>('all');
  const apiFilter = filter === 'all' ? undefined : filter;

  const project = useQuery({
    queryKey: ['project', id],
    queryFn: () => getProject(id!),
    enabled: Boolean(id),
  });

  const health = useQuery({
    queryKey: ['project-health', id],
    queryFn: () => getProjectHealth(id!),
    enabled: Boolean(id),
    refetchInterval: 5_000,
  });

  const pages = useQuery({
    queryKey: ['project-pages', id, apiFilter],
    queryFn: () => getProjectPages(id!, { filter: apiFilter, limit: 200 }),
    enabled: Boolean(id),
    refetchInterval: 5_000,
  });

  if (project.isPending) return <p>Loading…</p>;
  if (project.isError) return <p>Failed to load project.</p>;
  if (!project.data) return <p>Not found.</p>;

  const h = health.data;
  const inFlight = (h?.pagesTotal ?? 0) - (h?.pagesAudited ?? 0) > 0;

  return (
    <div className="col" style={{ gap: 'var(--space-6)' }}>
      <header>
        <h1>{project.data.name}</h1>
        <p style={{ color: 'var(--text-muted)' }}>{project.data.rootUrl}</p>
      </header>

      <ScoreCard health={h} />

      <FilterBar value={filter} onChange={setFilter} options={FILTER_OPTIONS} />

      <div className="card" style={{ overflow: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>URL</th>
              <th>Source</th>
              <th>Last audited</th>
              <th>Score</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {pages.data?.items.map((page) => (
              <tr key={page.id}>
                <td>
                  <a href={page.url} target="_blank" rel="noreferrer" className="mono">
                    {page.url}
                  </a>
                </td>
                <td>
                  <span className={`tag tag--${page.discoveredVia}`}>{page.discoveredVia}</span>
                </td>
                <td>{page.lastAuditedAt ? new Date(page.lastAuditedAt).toLocaleString() : '—'}</td>
                <td>{page.lastScore ? page.lastScore.overall : '—'}</td>
                <td>
                  <button type="button" disabled title="Coming in F5.4">
                    Re-audit
                  </button>
                </td>
              </tr>
            ))}
            {pages.data?.items.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
                  No pages match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer
        style={{
          position: 'sticky',
          bottom: 0,
          padding: 'var(--space-3)',
          background: 'var(--bg-elevated)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span className="mono">
          {h?.pagesAudited ?? 0} / {h?.pagesTotal ?? 0} audited
        </span>
        {inFlight && <span className="spinner" aria-label="In progress" />}
      </footer>
    </div>
  );
}
```

- [ ] **Step 3: Update `ScoreCard.tsx` to accept `health` and render null-safe**

Open `apps/web/src/components/ScoreCard.tsx`. Find the existing props and the existing render. Replace the component to accept a `health: ProjectHealth | undefined | null` prop and render null-safe.

The new shape:

```tsx
import type { ProjectHealth } from '../api.js';

interface Props {
  health: ProjectHealth | null | undefined;
}

export function ScoreCard({ health }: Props) {
  if (!health) {
    return (
      <div className="card">
        <p style={{ color: 'var(--text-muted)' }}>No health data yet.</p>
      </div>
    );
  }
  return (
    <div className="card col" style={{ gap: 'var(--space-3)' }}>
      <div>
        <h2 style={{ margin: 0 }}>Overall</h2>
        <p style={{ fontSize: 'var(--fs-2xl)', margin: 0 }}>{health.overall ?? '—'}</p>
      </div>
      <div className="col" style={{ gap: 'var(--space-2)' }}>
        {(['seo', 'cwv', 'geo', 'a11y', 'content'] as const).map((cat) => {
          const value = health.byCategory[cat];
          return (
            <div key={cat} className="row" style={{ gap: 'var(--space-2)' }}>
              <span style={{ width: '5rem', textTransform: 'uppercase', fontSize: 'var(--fs-sm)' }}>
                {cat}
              </span>
              <div
                style={{
                  flex: 1,
                  height: '8px',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-pill)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${value ?? 0}%`,
                    height: '100%',
                    background: value == null ? 'var(--border)' : 'var(--accent)',
                  }}
                />
              </div>
              <span className="mono" style={{ width: '3rem', textAlign: 'right' }}>
                {value ?? '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

If the existing `ScoreCard` has additional props or shape requirements, preserve them and add `health` as a new optional prop with the shape above. If a conflict, refactor: the existing usages of `ScoreCard` (in `AuditResults.tsx`, if any) need to be updated too.

- [ ] **Step 4: Run typecheck + build**

Run:
```bash
pnpm typecheck
pnpm --filter @jheo/web run build
```

Expected: typecheck clean, web build succeeds.

If the build fails because of `var(--fs-2xl)`, `var(--radius-pill)`, etc. not being defined, add them in `:root` in `styles.css` (e.g. `--fs-2xl: 2rem;`).

- [ ] **Step 5: Smoke test in browser**

Run: `pnpm run compose:up && pnpm --filter @jheo/web run dev`
Open `http://127.0.0.1:5173/app/projects/<id>` for a project created in Phase 1 smoke test.
Expected:
- Header with project name + rootUrl.
- ScoreCard with `Overall: —` (no audit has run since Phase 3 hasn't happened yet — score is null).
- FilterBar with 6 chips.
- Table of pages from `GET /:id/pages` with each row showing URL, source tag, `Last audited: —`, `Score: —`, disabled Re-audit button.
- Sticky footer: `0 / N audited` (where N is the discovered page count).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/ProjectDashboard.tsx apps/web/src/components/ScoreCard.tsx apps/web/src/styles.css
git commit -m "feat(web): project dashboard with health card, filters, and page table"
```

- [ ] **Step 7: Tear down**

```bash
pnpm run compose:down
```

---

## Task 6: End-to-end verification + readme update

**Files:**
- Modify: `README.md` (Phase 2 section)

- [ ] **Step 1: Add Phase 2 smoke test to README**

In `README.md`, after the existing smoke test, add:

````markdown
### Mapping UX (F5.2)

```bash
# After creating a project (see Smoke test above):
PID=<project-id>
curl -s "http://127.0.0.1:8080/api/projects/$PID/health" | jq
curl -s "http://127.0.0.1:8080/api/projects/$PID/pages?filter=not_audited" | jq '.total'
```

Expected: `/health` returns `{overall: null|number, byCategory: {...}, pagesAudited, pagesTotal, pagesWithError, lastAuditAt}`; `/pages?filter=not_audited` returns the count of pages that have never been audited.
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document F5.2 mapping UX routes"
```

---

## Self-Review Checklist

- [ ] `GET /:id/pages` returns paginated, filterable list with `lastScore` from most recent completed `PageAudit`
- [ ] `GET /:id/health` returns aggregated shape; null-safe when no audit has run
- [ ] Web `FilterBar` component is generic and uses design-system variables
- [ ] `ProjectDashboard` shows health card, filters, table, sticky footer
- [ ] `ScoreCard` renders null scores gracefully
- [ ] All tests pass; typecheck clean; web build succeeds
- [ ] Smoke test against running stack confirms the routes and the dashboard render
- [ ] Each task is its own commit with a `<scope>(<area>):` style message
