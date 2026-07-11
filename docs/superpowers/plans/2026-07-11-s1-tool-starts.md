# S1 — "A ferramenta liga" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the local stack bootstrappable in under two minutes and ensure every user-visible API failure shows a human, localized message — never a raw technical string.

**Architecture:** A `bin/dev-up` shell script brings Docker Compose to a healthy `/api/health`. The Vite `/api` proxy emits `503 { "error": "backend_unavailable" }` with `Retry-After` when the backend is down (instead of an empty 500). A shared `readJsonOrThrow` in `api.ts` maps that sentinel (and other HTTP errors) into `Error` messages that `humanError` already understands. `useBackendReachable` backs off exponentially while down. Remaining raw `error.message` UIs switch to `humanError` + `<ErrorState>`.

**Tech Stack:** Bash, Docker Compose, Vite 5.4 (`server.proxy` + `configure` / `http-proxy` error hook), React, TanStack Query, react-i18next, Vitest.

**Specs:**
- Program: `docs/superpowers/specs/2026-07-11-ux-impeccable-hybrid-design.md`
- Umbrella detail: `docs/superpowers/specs/2026-07-09-ux-program-design.md` (S1 section)
- Audit items: A1, A2, A3, A4, B4, B5 (`docs/ux-audit-2026-07-09.md`)

**Out of scope (later plans):** SI (Impeccable teach/tokens/Dashboard), S2 surfaces/IA, S3 score, S4 polish. Do not redesign UI chrome in this plan.

**Prerequisite:** S0 primitives exist (`humanError`, `<ErrorState>`, `useBackendReachable`). Task 0 verifies; do not reimplement them.

---

## File Structure

**Create:**
- `bin/dev-up` — bootstrap script (executable)
- `apps/web/src/dev/backendUnavailable.ts` — pure helper that writes the 503 JSON body (unit-tested; used from Vite config)
- `apps/web/src/dev/backendUnavailable.test.ts` — unit tests for the helper
- `apps/web/src/api/readJsonOrThrow.test.ts` — unit tests for response → Error mapping (export the helper for test, or colocate tests against a small extracted module)

**Modify:**
- `apps/web/vite.config.ts` — `/api` proxy object with `configure` error → 503
- `apps/web/src/api.ts` — harden `readJsonOrThrow`; route acceptance-path fetchers through it
- `apps/web/src/hooks/useBackendReachable.ts` — exponential `refetchInterval` when down
- `apps/web/src/hooks/__tests__/useBackendReachable.test.tsx` — backoff assertion
- `apps/web/src/pages/AuditRunner.tsx` — `humanError` + `<ErrorState>`
- `apps/web/src/pages/GenerationComposer.tsx` — same
- `apps/web/src/pages/FixesPage.tsx` — `ProjectChooser` error path
- `package.json` — `"dev-up": "bin/dev-up"`
- `docker/.env.example` — document every compose-consumed override (complete the A3 checklist)
- `README.md` — point Quickstart at `pnpm run dev-up` (one short paragraph; do not rewrite the whole README)

**Leave unchanged:** `score.ts`, sidebar IA, Project Dashboard layout, `PRODUCT.md` / `DESIGN.md` (SI).

---

### Task 0: Verify S0 closeout

Confirm shared foundations are already shipped before changing S1 surfaces.

**Files:**
- Read-only: `apps/web/src/api/errors.ts`, `apps/web/src/components/states/*`, `apps/web/src/hooks/useBackendReachable.ts`

- [ ] **Step 1: Run S0 unit tests**

```bash
pnpm --filter @jheo/web test src/api/errors.test.ts src/components/states/__tests__/EmptyState.test.tsx src/components/states/__tests__/ErrorState.test.tsx src/hooks/__tests__/useBackendReachable.test.tsx
```

Expected: all PASS.

- [ ] **Step 2: Confirm reference consumers exist**

```bash
rg -n "humanError|ErrorState|useBackendReachable" apps/web/src/pages/ProjectsList.tsx apps/web/src/components/Layout.tsx
```

Expected: `ProjectsList` imports `humanError` + `ErrorState`; `Layout` imports `useBackendReachable`.

- [ ] **Step 3: Commit nothing** (verification only). If any test fails, stop and fix S0 before continuing — do not start Task 1.

---

### Task 1: Pure 503 writer for the Vite proxy

Extract the response body so the proxy hook stays thin and testable without booting Vite.

**Files:**
- Create: `apps/web/src/dev/backendUnavailable.ts`
- Create: `apps/web/src/dev/backendUnavailable.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/dev/backendUnavailable.test.ts
import { describe, it, expect, vi } from 'vitest';
import { sendBackendUnavailable } from './backendUnavailable.js';

describe('sendBackendUnavailable', () => {
  it('writes 503 JSON with backend_unavailable and Retry-After', () => {
    const writeHead = vi.fn();
    const end = vi.fn();
    sendBackendUnavailable({ headersSent: false, writeHead, end }, 5);
    expect(writeHead).toHaveBeenCalledWith(503, {
      'Content-Type': 'application/json',
      'Retry-After': '5',
    });
    expect(end).toHaveBeenCalledWith(JSON.stringify({ error: 'backend_unavailable' }));
  });

  it('no-ops when headers were already sent', () => {
    const writeHead = vi.fn();
    const end = vi.fn();
    sendBackendUnavailable({ headersSent: true, writeHead, end }, 5);
    expect(writeHead).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm --filter @jheo/web test src/dev/backendUnavailable.test.ts
```

Expected: FAIL (module not found / export missing).

- [ ] **Step 3: Implement**

```ts
// apps/web/src/dev/backendUnavailable.ts
export interface WritableProxyResponse {
  headersSent?: boolean;
  writeHead: (statusCode: number, headers: Record<string, string>) => void;
  end: (body?: string) => void;
}

/** JSON body the SPA maps via humanError(new Error('backend_unavailable')). */
export const BACKEND_UNAVAILABLE_BODY = { error: 'backend_unavailable' as const };

export function sendBackendUnavailable(
  res: WritableProxyResponse,
  retryAfterSec = 5,
): void {
  if (res.headersSent) return;
  res.writeHead(503, {
    'Content-Type': 'application/json',
    'Retry-After': String(retryAfterSec),
  });
  res.end(JSON.stringify(BACKEND_UNAVAILABLE_BODY));
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
pnpm --filter @jheo/web test src/dev/backendUnavailable.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/dev/backendUnavailable.ts apps/web/src/dev/backendUnavailable.test.ts
git commit -m "feat(web): add testable 503 backend_unavailable helper for Vite proxy"
```

---

### Task 2: Wire Vite `/api` proxy error → 503

When the API is down, Vite's default proxy often yields an empty/broken response. Handle the proxy `error` event and write our JSON 503.

**Files:**
- Modify: `apps/web/vite.config.ts`

- [ ] **Step 1: Replace the string shorthand proxy with a configured object**

In `apps/web/vite.config.ts`, change the `server.proxy` entry from the string form to:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sendBackendUnavailable } from './src/dev/backendUnavailable';

const apiTarget = `http://127.0.0.1:${process.env.JHEO_API_PORT ?? '8080'}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            // http-proxy may pass a Socket; only Node ServerResponse has writeHead.
            const r = res as { headersSent?: boolean; writeHead?: Function; end?: Function };
            if (r && typeof r.writeHead === 'function' && typeof r.end === 'function') {
              sendBackendUnavailable(
                { headersSent: r.headersSent, writeHead: r.writeHead.bind(r), end: r.end.bind(r) },
                5,
              );
            }
          });
        },
      },
    },
  },
  // ... keep existing build + test blocks unchanged
});
```

Keep the existing `build` and `test` sections exactly as they are today.

- [ ] **Step 2: Typecheck / smoke the config loads**

```bash
pnpm --filter @jheo/web exec vite --version
pnpm --filter @jheo/web test src/dev/backendUnavailable.test.ts
```

Expected: Vite prints a version; helper tests still PASS. (Full proxy behavior is verified in Task 11 manual acceptance with API stopped.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/vite.config.ts
git commit -m "fix(web): return 503 backend_unavailable when Vite API proxy target is down"
```

---

### Task 3: Harden `readJsonOrThrow` and acceptance-path API calls

Blind `r.json()` on `listProjects` / `createProject` / `runAudit` treats a 503 JSON error body as success data. Route the create→audit path through a single parser that throws sentinels `humanError` already maps.

**Files:**
- Modify: `apps/web/src/api.ts` (replace the existing private `readJsonOrThrow`; update listed callers)
- Create: `apps/web/src/api/readJsonOrThrow.ts` (extract so it is unit-testable without importing the whole `api.ts` graph)
- Create: `apps/web/src/api/readJsonOrThrow.test.ts`
- Modify: `apps/web/src/api.ts` — import and re-use the extracted helper; delete the old private copy

- [ ] **Step 1: Write failing tests**

```ts
// apps/web/src/api/readJsonOrThrow.test.ts
import { describe, it, expect } from 'vitest';
import { readJsonOrThrow } from './readJsonOrThrow.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('readJsonOrThrow', () => {
  it('returns parsed JSON on 200', async () => {
    const data = await readJsonOrThrow<{ id: string }>(jsonResponse(200, { id: 'p1' }), 'projects');
    expect(data).toEqual({ id: 'p1' });
  });

  it('throws backend_unavailable on 503', async () => {
    await expect(
      readJsonOrThrow(jsonResponse(503, { error: 'backend_unavailable' }), 'projects'),
    ).rejects.toThrow('backend_unavailable');
  });

  it('throws backend_unavailable on 503 even without body', async () => {
    await expect(
      readJsonOrThrow(new Response('', { status: 503 }), 'projects'),
    ).rejects.toThrow('backend_unavailable');
  });

  it('throws Failed to load <label>: <status> for other errors without error field', async () => {
    await expect(
      readJsonOrThrow(jsonResponse(500, {}), 'health'),
    ).rejects.toThrow('Failed to load health: 500');
  });

  it('throws body.error string when present', async () => {
    await expect(
      readJsonOrThrow(jsonResponse(400, { error: 'rate_limited' }), 'translate'),
    ).rejects.toThrow('rate_limited');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm --filter @jheo/web test src/api/readJsonOrThrow.test.ts
```

- [ ] **Step 3: Implement module**

```ts
// apps/web/src/api/readJsonOrThrow.ts
export async function readJsonOrThrow<T>(r: Response, label = 'resource'): Promise<T> {
  const text = await r.text();
  let body: { error?: unknown } | null = null;
  if (text) {
    try {
      body = JSON.parse(text) as { error?: unknown };
    } catch {
      body = null;
    }
  }

  if (!r.ok) {
    if (r.status === 503 || body?.error === 'backend_unavailable') {
      throw new Error('backend_unavailable');
    }
    if (typeof body?.error === 'string') {
      throw new Error(body.error);
    }
    throw new Error(`Failed to load ${label}: ${r.status}`);
  }

  return body as T;
}
```

- [ ] **Step 4: Point `api.ts` at the module and fix acceptance-path callers**

1. Delete the private `async function readJsonOrThrow` inside `api.ts` (around the GSC section).
2. Add near the other imports/exports:

```ts
import { readJsonOrThrow } from './api/readJsonOrThrow.js';
```

3. Replace these function bodies (keep signatures):

```ts
export async function listProjects(): Promise<Project[]> {
  const r = await localeFetch(`${API}/projects`);
  return readJsonOrThrow(r, 'projects');
}

export async function createProject(input: { domain: string }): Promise<Project> {
  const r = await localeFetch(`${API}/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJsonOrThrow(r, 'projects');
}

export async function getProject(id: string): Promise<ProjectDetail> {
  const r = await localeFetch(`${API}/projects/${id}`);
  return readJsonOrThrow(r, 'project');
}

export async function runAudit(projectId: string): Promise<Audit> {
  const r = await localeFetch(`${API}/audits`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId, config: {} }),
  });
  return readJsonOrThrow(r, 'audits');
}

export async function getAudit(id: string): Promise<Audit & { findings: Finding[] }> {
  const r = await localeFetch(`${API}/audits/${id}`);
  return readJsonOrThrow(r, 'audit');
}
```

Leave other `api.ts` helpers that already call `readJsonOrThrow` as-is (they now use the imported function). Helpers that still use raw `r.json()` without `ok` checks are **YAGNI for S1** except the five above (acceptance path). Do not boil the ocean.

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @jheo/web test src/api/readJsonOrThrow.test.ts src/api/errors.test.ts src/pages/__tests__/ProjectsList.test.tsx
```

Expected: PASS. If `ProjectsList` create-error test still mocks `Failed to load health: 500`, leave it — that path still maps via `humanError`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/api/readJsonOrThrow.ts apps/web/src/api/readJsonOrThrow.test.ts apps/web/src/api.ts
git commit -m "fix(web): map API HTTP errors through readJsonOrThrow for audit path"
```

---

### Task 4: Exponential backoff on `useBackendReachable` when down

Constant 15s polling while the API is dead hammers a dead port. Back off while `down`; reset to 15s when reachable again.

**Files:**
- Modify: `apps/web/src/hooks/useBackendReachable.ts`
- Modify: `apps/web/src/hooks/__tests__/useBackendReachable.test.tsx`

- [ ] **Step 1: Add a failing test for dynamic interval**

Append to the existing test file:

```ts
  it('uses a longer refetchInterval after a down result than after reachable', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: false } as Response));
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = createQueryClientWrapper();
    const { result } = renderHook(() => useBackendReachable(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('down'));
    // Implementation exposes retryInMs for S1 consumers / assertions.
    expect(result.current.retryInMs).toBeGreaterThan(15_000);
  });
```

Extend the exported interface in the same change set (Step 3) so this compiles.

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm --filter @jheo/web test src/hooks/__tests__/useBackendReachable.test.tsx
```

Expected: FAIL (`retryInMs` missing and/or interval not lengthened).

- [ ] **Step 3: Implement backoff**

Replace `apps/web/src/hooks/useBackendReachable.ts` with:

```ts
import { useQuery } from '@tanstack/react-query';

export interface BackendReachable {
  status: 'pending' | 'reachable' | 'down';
  reachable: boolean;
  latencyMs: number | null;
  lastCheckedAt: Date;
  /** Suggested wait before next poll; 15s when healthy/pending, grows while down. */
  retryInMs: number;
}

interface HealthResult {
  ok: boolean;
  latencyMs: number;
  checkedAt: Date;
}

const BASE_MS = 15_000;
const MAX_MS = 60_000;

async function pingHealth(): Promise<HealthResult> {
  const start = performance.now();
  const r = await fetch('/api/health', { cache: 'no-store' });
  return {
    ok: r.ok,
    latencyMs: Math.round(performance.now() - start),
    checkedAt: new Date(),
  };
}

function backoffMs(failureCount: number): number {
  // failureCount 0 → 15s; 1 → 30s; 2+ → 60s cap
  return Math.min(MAX_MS, BASE_MS * 2 ** Math.max(0, failureCount));
}

export function useBackendReachable(): BackendReachable {
  const q = useQuery({
    queryKey: ['health'],
    queryFn: pingHealth,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchInterval: (query) => {
      const down =
        query.state.status === 'error' ||
        (query.state.data !== undefined && query.state.data.ok === false);
      if (!down) return BASE_MS;
      const failures = query.state.fetchFailureCount + (query.state.data?.ok === false ? 1 : 0);
      return backoffMs(Math.max(1, failures));
    },
  });

  if (q.isPending) {
    return {
      status: 'pending',
      reachable: false,
      latencyMs: null,
      lastCheckedAt: new Date(0),
      retryInMs: BASE_MS,
    };
  }
  if (q.isError || !q.data) {
    return {
      status: 'down',
      reachable: false,
      latencyMs: null,
      lastCheckedAt: new Date(0),
      retryInMs: backoffMs(Math.max(1, q.failureCount)),
    };
  }
  if (!q.data.ok) {
    return {
      status: 'down',
      reachable: false,
      latencyMs: q.data.latencyMs,
      lastCheckedAt: q.data.checkedAt,
      retryInMs: backoffMs(1),
    };
  }
  return {
    status: 'reachable',
    reachable: true,
    latencyMs: q.data.latencyMs,
    lastCheckedAt: q.data.checkedAt,
    retryInMs: BASE_MS,
  };
}
```

`Layout.tsx` can ignore `retryInMs` for now (optional title later). Do not change HealthIndicator visuals in S1 beyond what already exists.

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm --filter @jheo/web test src/hooks/__tests__/useBackendReachable.test.tsx
```

If React Query's `fetchFailureCount` semantics make the exact `retryInMs` flaky, assert `retryInMs >= 30_000` when `status === 'down'` after `ok: false`, which matches `backoffMs(1)`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useBackendReachable.ts apps/web/src/hooks/__tests__/useBackendReachable.test.tsx
git commit -m "feat(web): exponential health-poll backoff while API is down"
```

---

### Task 5: `humanError` + `<ErrorState>` on AuditRunner

**Files:**
- Modify: `apps/web/src/pages/AuditRunner.tsx`
- Create: `apps/web/src/pages/__tests__/AuditRunner.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/src/pages/__tests__/AuditRunner.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuditRunner } from '../AuditRunner.js';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';

vi.mock('../../api.js', async () => {
  const actual = await vi.importActual<typeof import('../../api.js')>('../../api.js');
  return { ...actual, runAudit: vi.fn() };
});

import { runAudit } from '../../api.js';

function renderRunner() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/projects/p1/audit']}>
          <Routes>
            <Route path="/projects/:projectId/audit" element={<AuditRunner />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('AuditRunner errors', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('pt-BR');
    vi.mocked(runAudit).mockReset();
  });

  it('shows translated ErrorState instead of raw Error.message', async () => {
    vi.mocked(runAudit).mockRejectedValueOnce(new Error('backend_unavailable'));
    renderRunner();
    await userEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/indisponível|unavailable|servidor/i);
    });
    expect(screen.queryByText('backend_unavailable')).toBeNull();
  });
});
```

If `@testing-library/user-event` is not a dependency, use `fireEvent.click` from `@testing-library/react` instead.

- [ ] **Step 2: Run — expect FAIL** (still shows raw message)

```bash
pnpm --filter @jheo/web test src/pages/__tests__/AuditRunner.test.tsx
```

- [ ] **Step 3: Implement**

```tsx
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { humanError, runAudit } from '../api.js';
import { ErrorState } from '../components/states/index.js';

export function AuditRunner() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const run = useMutation({
    mutationFn: () => runAudit(projectId!),
    onSuccess: (audit) => navigate(`/audits/${audit.id}`),
  });

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">{t('audit.runner.title')}</h1>
          <p className="page__subtitle">{t('audit.runner.subtitle')}</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card__title">{t('audit.runner.readyTitle')}</div>
        <p className="tiny muted" style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          {t('audit.runner.readyHint')}
        </p>
        <button
          className="btn btn--primary btn--lg"
          onClick={() => run.mutate()}
          disabled={run.isPending}
        >
          {run.isPending ? t('audit.runner.starting') : t('audit.runner.start')}
        </button>
        {run.isError &&
          (() => {
            const e = humanError(run.error);
            return (
              <ErrorState
                titleKey={e.key}
                {...(e.params ? { params: e.params } : {})}
                {...(e.retry ? { retry: e.retry } : {})}
                onRetry={() => run.mutate()}
                className="tiny"
              />
            );
          })()}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm --filter @jheo/web test src/pages/__tests__/AuditRunner.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/AuditRunner.tsx apps/web/src/pages/__tests__/AuditRunner.test.tsx
git commit -m "fix(web): show humanError ErrorState on AuditRunner failures"
```

---

### Task 6: `humanError` + `<ErrorState>` on GenerationComposer + FixesPage chooser

**Files:**
- Modify: `apps/web/src/pages/GenerationComposer.tsx`
- Modify: `apps/web/src/pages/FixesPage.tsx`

- [ ] **Step 1: GenerationComposer — replace raw error span**

Find:

```tsx
{create.isError && (
  <span className="tiny" style={{ color: 'var(--danger)' }}>
    {(create.error as Error).message}
  </span>
)}
```

Replace with the same `humanError` + `<ErrorState className="tiny" />` pattern as ProjectsList / AuditRunner (import `humanError` from `../api.js` and `ErrorState` from `../components/states/index.js`). Wire `onRetry` to re-submit the current form values via `create.mutate(...)` using the same payload the submit handler builds.

- [ ] **Step 2: FixesPage `ProjectChooser` — replace string error**

In `openLatestAudit` catch, store a `HumanError` (or the raw `unknown` and map at render time):

```tsx
const [error, setError] = useState<unknown>(null);
// ...
} catch (e) {
  setError(e);
}
// ...
{error != null &&
  (() => {
    const e = humanError(error);
    return (
      <ErrorState
        titleKey={e.key}
        {...(e.params ? { params: e.params } : {})}
        {...(e.retry ? { retry: e.retry } : {})}
        onRetry={() => setError(null)}
      />
    );
  })()}
```

Import `humanError` and `ErrorState`. Remove the raw `<p className="error">{error}</p>` block.

- [ ] **Step 3: Run related tests**

```bash
pnpm --filter @jheo/web test src/pages/__tests__/FixesPage.test.tsx src/pages/__tests__/ProjectsList.test.tsx src/api/errors.test.ts
```

Expected: PASS (update FixesPage tests if they asserted on raw message text).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/GenerationComposer.tsx apps/web/src/pages/FixesPage.tsx apps/web/src/pages/__tests__/FixesPage.test.tsx
git commit -m "fix(web): humanize GenerationComposer and Fixes chooser errors"
```

---

### Task 7: `bin/dev-up` bootstrap script

Shell script (not Node): lower ceremony on macOS/Linux; Windows is best-effort with a clear message. Matches umbrella open question choice: shell.

**Files:**
- Create: `bin/dev-up`
- Modify: `package.json` (add script)
- Modify: `README.md` (point Quickstart at `pnpm run dev-up`)

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# bin/dev-up — best-effort local stack bootstrap for JHEO (S1 / A1).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/docker/docker-compose.yml" --env-file "$ROOT/docker/.env")
API_PORT="${API_PORT:-8080}"
HEALTH_URL="http://127.0.0.1:${API_PORT}/api/health"
DOCKER_WAIT_SECS="${DOCKER_WAIT_SECS:-60}"
HEALTH_WAIT_SECS="${HEALTH_WAIT_SECS:-120}"

if [[ ! -f "$ROOT/docker/.env" ]]; then
  echo "Creating docker/.env from docker/.env.example (all defaults)."
  cp "$ROOT/docker/.env.example" "$ROOT/docker/.env"
fi

echo "==> Waiting for Docker daemon (up to ${DOCKER_WAIT_SECS}s)…"
deadline=$((SECONDS + DOCKER_WAIT_SECS))
until docker info >/dev/null 2>&1; do
  if (( SECONDS >= deadline )); then
    echo "Docker is not reachable."
    echo "On macOS: open Docker Desktop, wait until it is healthy, then re-run: pnpm run dev-up"
    if command -v osascript >/dev/null 2>&1; then
      echo "Tip: open -a Docker"
    fi
    exit 1
  fi
  sleep 2
done
echo "Docker OK."

echo "==> compose up -d --build"
"${COMPOSE[@]}" up -d --build

echo "==> Waiting for ${HEALTH_URL} (up to ${HEALTH_WAIT_SECS}s)…"
deadline=$((SECONDS + HEALTH_WAIT_SECS))
until curl -fsS "$HEALTH_URL" >/dev/null 2>&1; do
  if (( SECONDS >= deadline )); then
    echo "API health check did not pass."
    echo "Inspect: pnpm run compose:logs"
    echo "If tables are missing: docker exec \$(docker compose -f docker/docker-compose.yml ps -q api) prisma migrate deploy"
    exit 1
  fi
  sleep 2
done

echo "API healthy at ${HEALTH_URL}"
echo "Next: pnpm --filter @jheo/web dev  →  http://127.0.0.1:5173"
echo "Or open the compose UI if you serve the built SPA from the API."
```

- [ ] **Step 2: Make executable and add npm script**

```bash
chmod +x bin/dev-up
```

In root `package.json` `scripts`:

```json
"dev-up": "bin/dev-up"
```

- [ ] **Step 3: README Quickstart — add at the top of the Quickstart section**

```markdown
### Local bootstrap (recommended)

```bash
pnpm run dev-up          # Docker daemon → compose up → wait for /api/health
pnpm --filter @jheo/web dev
open http://127.0.0.1:5173
```
```

Keep the existing `compose:up` docs below as an alternative.

- [ ] **Step 4: Dry-run syntax check**

```bash
bash -n bin/dev-up
```

Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add bin/dev-up package.json README.md
git commit -m "feat: add bin/dev-up stack bootstrap for local DX"
```

---

### Task 8: Complete `docker/.env.example` (A3)

Dockerfile already runs `prisma migrate deploy` on boot — do **not** switch back to `db push`. Document overrides so a fresh clone is not missing variables.

**Files:**
- Modify: `docker/.env.example`

- [ ] **Step 1: Ensure the example lists every override compose/`dev-up` care about**

Final file should include (comments OK; values optional):

```bash
# Host port overrides (compose reads these)
# POSTGRES_PORT=5432
# REDIS_PORT=6379
# API_PORT=8080

# Required for encrypted distribution channel credentials (publish).
# Generate: openssl rand -hex 32
# JHEO_SECRET_KEY=

# --- LLM provider routing (generation + suggestions + translate) ---
# OPENAI_BASE_URL=
# OPENAI_API_KEY=
# OPENAI_EMBEDDING_API_KEY=
# JHEO_SUGGESTION_MODEL=
# JHEO_TRANSLATE_MODEL=
```

Keep any existing MiniMax/OpenAI commentary already in the file; merge rather than delete.

- [ ] **Step 2: Commit**

```bash
git add docker/.env.example
git commit -m "docs(docker): complete .env.example overrides for S1 bootstrap"
```

---

### Task 9: Manual acceptance (S1 done gate)

Do not mark S1 complete until this passes on a real machine.

- [ ] **Step 1: Fresh-ish bootstrap**

```bash
pnpm run compose:down || true
pnpm run dev-up
pnpm --filter @jheo/web dev
```

- [ ] **Step 2: Happy path (&lt; 2 minutes from browser open)**

1. Open `http://127.0.0.1:5173`
2. Top bar shows API connected (latency ms, not "down")
3. Create a project
4. Run a basic audit from AuditRunner
5. Land on audit results without raw error strings

- [ ] **Step 3: Backend-down honesty**

```bash
pnpm run compose:down
```

Reload the SPA (Vite still up). Trigger any `/api` call (refresh Projects).

Expected:
- Network response for `/api/*` is **503** with body `{"error":"backend_unavailable"}` (DevTools)
- UI shows translated `errors.backend_down` (or equivalent), **not** `Unexpected end of JSON input` / `backend_unavailable` raw / empty message
- Health indicator eventually shows down; polling does not stay at a frantic constant if you watch network timing (interval grows)

- [ ] **Step 4: Bring stack back**

```bash
pnpm run dev-up
```

Health returns to connected without restarting Vite.

- [ ] **Step 5: Final test suite**

```bash
pnpm --filter @jheo/web test
```

Expected: PASS (fix or quarantine only unrelated pre-existing failures; do not ignore S1 regressions).

- [ ] **Step 6: No commit required** unless Step 5 forced small fixes — then commit those fixes separately with a clear message.

---

## Spec coverage (self-review)

| Spec / audit item | Task(s) |
|---|---|
| A1 `dev-up` | Task 7, Task 9 |
| A2 Vite 503 `backend_unavailable` | Task 1, Task 2, Task 3, Task 9 |
| A3 env example + migrate on boot | Task 8 (Dockerfile already migrates) |
| A4 backoff polling | Task 4 |
| B4/B5 human errors on mutation surfaces | Task 3, Task 5, Task 6 (ProjectsList already done in S0) |
| S1 acceptance &lt;2 min + human errors | Task 9 |
| SI / S2 / S3 / S4 | Explicitly out of scope |

## Placeholder scan

No TBD/TODO steps. Proxy behavior that cannot be unit-tested in Vitest is covered by Task 9 manual steps.

## Type consistency

- Sentinel string is always `backend_unavailable` (Error message) → `humanError` → `errors.backend_down`.
- `readJsonOrThrow(r, label)` signature shared by Task 3 callers.
- `BackendReachable.retryInMs` added in Task 4; Layout may ignore it.

## Next plans (not this file)

After S1 acceptance: brainstorm/spec/plan **SI** (Impeccable teach → tokens → Project Dashboard), then S2, S3, S4 per `2026-07-11-ux-impeccable-hybrid-design.md`.
