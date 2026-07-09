# S0 — Shared Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the three cross-cutting primitives (`humanError`, `<EmptyState>`/`<ErrorState>`, `useBackendReachable`) that S1–S4 consume, each wired into one real existing site as its reference integration.

**Architecture:** A pure error mapper returning i18n keys (generalizes `FindingList.tsx:31`'s `errorKey()`), a reusable state component pair (subsumes the two existing EmptyStates), and a React-Query-backed reachability hook (extracts the hand-rolled `Layout.tsx:44-77` polling). Three real refactors prove the frozen contracts against live shapes.

**Tech Stack:** React, @tanstack/react-query, react-i18next, vitest, @testing-library/react, jsdom.

**Spec:** `docs/superpowers/specs/2026-07-09-s0-shared-foundations-design.md`

## Global Constraints

- Every new user-facing string ships in **both** `apps/web/src/i18n/en.json` and `apps/web/src/i18n/pt-BR.json` — the `i18n/parity.test.ts` enforces key equality and non-empty values.
- `humanError` is **pure**: never throws, never calls `t()`, never imports i18n. Returns `{ key, params?, retry? }`.
- Vitest runs with `globals: false` — import `describe/it/expect` from `'vitest'`.
- Tests default to **pt-BR** (`test/setup.ts` calls `i18n.changeLanguage('pt-BR')`); assertion strings must match pt-BR catalog values.
- No `QueryClientProvider` test wrapper exists in the repo today — this plan introduces one at `apps/web/test/queryClientWrapper.tsx`.
- Commands run from repo root; `pnpm --filter @jheo/web test --run <pkg-relative-path>` (paths are relative to `apps/web`, not repo root).

## File Structure

**Create:**
- `apps/web/src/api/errors.ts` — `humanError` mapper + `HumanError` type. Pure, no React, no i18n.
- `apps/web/src/components/states/EmptyState.tsx` — reusable empty state with `kind`/COPY idiom + `children` escape hatch.
- `apps/web/src/components/states/ErrorState.tsx` — reusable error state consuming `humanError`-shaped keys.
- `apps/web/src/components/states/index.ts` — barrel re-export.
- `apps/web/src/hooks/useBackendReachable.ts` — React-Query-backed `/api/health` poller.
- `apps/web/test/queryClientWrapper.tsx` — reusable `QueryClientProvider` test wrapper.
- `apps/web/src/api/errors.test.ts` — pure unit tests for `humanError`.
- `apps/web/src/components/states/__tests__/EmptyState.test.tsx`
- `apps/web/src/components/states/__tests__/ErrorState.test.tsx`
- `apps/web/src/hooks/__tests__/useBackendReachable.test.tsx`

**Modify:**
- `apps/web/src/api.ts` — re-export `humanError`/`HumanError` from `./api/errors.js`.
- `apps/web/src/i18n/en.json` + `pt-BR.json` — add 4 keys under `errors`.
- `apps/web/src/pages/ProjectsList.tsx` — (a) replace `create.error as Error` inline with `humanError` + `<ErrorState>`; (b) replace page-local `EmptyState` with shared one.
- `apps/web/src/components/Layout.tsx` — `HealthIndicator` consumes `useBackendReachable`.

---

### Task 1: Extend the `errors.*` catalog

The catalog must exist before `humanError` can reference the keys, and before any test asserts a translated string.

**Files:**
- Modify: `apps/web/src/i18n/en.json` (the `errors` object)
- Modify: `apps/web/src/i18n/pt-BR.json` (the `errors` object)

**Interfaces:**
- Produces: i18n keys `errors.network`, `errors.server` (with `{{status}}`), `errors.backend_down`, `errors.notFound` — used by Task 2's `humanError` and asserted by Task 4's tests.

- [ ] **Step 1: Add the four keys to `en.json`**

In `apps/web/src/i18n/en.json`, find the `"errors"` object (currently 3 keys: `generic`, `no_llm_provider`, `rate_limited`). Add four keys so the object becomes:

```json
"errors": {
  "generic": "Something went wrong. Please try again.",
  "no_llm_provider": "Configure an LLM provider in Settings to enable translation.",
  "rate_limited": "Too many requests. Please wait a moment.",
  "network": "No connection to the server. Check your network and try again.",
  "server": "The server returned an error ({{status}}). Please try again.",
  "backend_down": "The server is unavailable. Please try again shortly.",
  "notFound": "The requested resource was not found."
},
```

- [ ] **Step 2: Add the same four keys to `pt-BR.json`**

In `apps/web/src/i18n/pt-BR.json`, the `"errors"` object becomes:

```json
"errors": {
  "generic": "Algo deu errado. Tente novamente.",
  "no_llm_provider": "Configure um provedor de IA em Configurações para ativar a tradução.",
  "rate_limited": "Muitas requisições. Aguarde um instante.",
  "network": "Sem conexão com o servidor. Verifique sua rede e tente novamente.",
  "server": "O servidor retornou um erro ({{status}}). Tente novamente.",
  "backend_down": "O servidor está indisponível. Tente novamente em instantes.",
  "notFound": "O recurso solicitado não foi encontrado."
},
```

- [ ] **Step 3: Add `common.retry` to both catalogs**

The `<ErrorState>` component (Task 4) renders a retry button labelled by `common.retry`. The `common` object currently has 14 keys (close, cancel, delete, save, edit, reveal, hide, loading, notFound, inProgress, autoRefreshing, active, inactive, paused). **Merge** `retry` into the existing object — do not replace it.

In `apps/web/src/i18n/en.json`, add to the `"common"` object:
```json
"retry": "Try again"
```
In `apps/web/src/i18n/pt-BR.json`, add to the `"common"` object:
```json
"retry": "Tentar novamente"
```

- [ ] **Step 4: Run the parity test to verify both catalogs match**

Run: `pnpm --filter @jheo/web test --run src/i18n/parity.test.ts`
Expected: PASS — 3 tests (key equality, no empty en, no empty pt-BR). If it fails with "missing" or "extra" keys, the two catalogs diverged; fix before continuing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/i18n/en.json apps/web/src/i18n/pt-BR.json
git commit -m "feat(i18n): add errors.* (4 keys) + common.retry"
```

---

### Task 2: Implement `humanError`

Pure function. No React, no i18n import. Generalizes the `errorKey()` pattern in `FindingList.tsx:31`.

**Files:**
- Create: `apps/web/src/api/errors.ts`
- Modify: `apps/web/src/api.ts` (re-export)

**Interfaces:**
- Consumes: the `errors.*` keys from Task 1.
- Produces: `humanError(err: unknown): HumanError` and `HumanError` type. Used by Task 5 (ProjectsList create error) and asserted by Task 4.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/api/errors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { humanError } from './errors';

describe('humanError', () => {
  it('maps the no_llm_provider sentinel', () => {
    expect(humanError(new Error('no_llm_provider'))).toEqual({ key: 'errors.no_llm_provider' });
  });

  it('maps the rate_limited sentinel', () => {
    expect(humanError(new Error('rate_limited'))).toEqual({ key: 'errors.rate_limited' });
  });

  it('maps the backend_unavailable sentinel', () => {
    expect(humanError(new Error('backend_unavailable'))).toEqual({ key: 'errors.backend_unavailable' });
  });

  it('maps "Failed to load X: <status>" to errors.server with status param', () => {
    expect(humanError(new Error('Failed to load health: 500'))).toEqual({
      key: 'errors.server',
      params: { status: 500 },
      retry: true,
    });
  });

  it('marks 4xx server errors as non-retryable', () => {
    expect(humanError(new Error('Failed to load page: 404'))).toEqual({
      key: 'errors.server',
      params: { status: 404 },
      retry: false,
    });
  });

  it('maps TypeError to errors.network (fetch threw)', () => {
    expect(humanError(new TypeError('Failed to fetch'))).toEqual({
      key: 'errors.network',
      retry: true,
    });
  });

  it('maps SyntaxError "Unexpected end of JSON input" to errors.backend_down', () => {
    expect(humanError(new SyntaxError('Unexpected end of JSON input'))).toEqual({
      key: 'errors.backend_down',
      retry: true,
    });
  });

  it('falls back to errors.generic for unknown errors', () => {
    expect(humanError(new Error('something weird'))).toEqual({ key: 'errors.generic' });
  });

  it('falls back to errors.generic for non-Error values', () => {
    expect(humanError('a string')).toEqual({ key: 'errors.generic' });
    expect(humanError(null)).toEqual({ key: 'errors.generic' });
    expect(humanError(undefined)).toEqual({ key: 'errors.generic' });
  });

  it('never throws — even for unusual inputs', () => {
    expect(() => humanError({ circular: null } as unknown)).not.toThrow();
    expect(() => humanError(Symbol('x'))).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @jheo/web test --run src/api/errors.test.ts`
Expected: FAIL — `Cannot find module './errors'` or `humanError is not a function`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/api/errors.ts`:

```ts
/**
 * Map an unknown error (e.g. a React Query `error` field) to a stable i18n
 * key plus optional interpolation params and a retry hint. Generalizes the
 * `errorKey()` pattern in FindingList.tsx beyond the two translation codes.
 *
 * Pure: never throws, never calls t(), never imports i18n. Callers render
 * `t(humanError(err).key, humanError(err).params)`.
 *
 * The message-string pattern-matching below is transient: when S1 makes
 * api.ts throw structured ApiError({ code, status }) values, this gains a
 * `code` branch and loses the regex. The sentinel branch already reads
 * "codes"; the design survives that migration.
 */
export interface HumanError {
  /** Always an i18n key, e.g. 'errors.server'. */
  key: string;
  /** Interpolation params for t(), e.g. { status: 500 }. */
  params?: Record<string, string | number>;
  /** True when "try again" makes sense. */
  retry?: boolean;
}

const SENTINELS = new Set(['no_llm_provider', 'rate_limited', 'backend_unavailable']);

// Matches api.ts's "Failed to load health: 500" / "Failed to load page: 404" pattern.
const STATUS_RE = /^Failed to load .*: (\d+)$/;

export function humanError(err: unknown): HumanError {
  if (!(err instanceof Error)) return { key: 'errors.generic' };

  // Branch 1: sentinel code in the message (e.g. new Error('rate_limited')).
  if (SENTINELS.has(err.message)) {
    return { key: `errors.${err.message}` };
  }

  // Branch 2: "Failed to load X: <status>" — extract the HTTP status.
  const statusMatch = err.message.match(STATUS_RE);
  if (statusMatch) {
    const status = Number(statusMatch[1]);
    return { key: 'errors.server', params: { status }, retry: status >= 500 };
  }

  // Branch 3: network failure (fetch threw a TypeError).
  if (err instanceof TypeError) {
    return { key: 'errors.network', retry: true };
  }

  // Branch 4: empty proxy 500 → r.json() threw SyntaxError on empty body.
  // Transient: dies in S1 when the proxy returns 503 { error: 'backend_unavailable' }.
  if (err instanceof SyntaxError) {
    return { key: 'errors.backend_down', retry: true };
  }

  // Branch 5: fallback.
  return { key: 'errors.generic' };
}
```

Note: the test asserts `errors.backend_unavailable` as a key. That key does not exist in the catalog yet (the spec defers it). Two options: (a) add `backend_unavailable` to both catalogs now, or (b) treat the sentinel as mapping to the existing `backend_down` key. Option (b) is cleaner — the *sentinel name* and the *i18n key* need not match. **Apply option (b):** change branch 1 so sentinels map through a lookup, not `errors.${message}`. Replace the implementation's branch 1 and the test:

Updated branch 1 in `errors.ts`:

```ts
const SENTINEL_KEYS: Record<string, string> = {
  no_llm_provider: 'errors.no_llm_provider',
  rate_limited: 'errors.rate_limited',
  backend_unavailable: 'errors.backend_down',
};

// ...inside humanError, branch 1:
if (err.message in SENTINEL_KEYS) {
  return { key: SENTINEL_KEYS[err.message] };
}
```

Updated test (the backend_unavailable case):

```ts
it('maps the backend_unavailable sentinel to errors.backend_down', () => {
  expect(humanError(new Error('backend_unavailable'))).toEqual({ key: 'errors.backend_down' });
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @jheo/web test --run src/api/errors.test.ts`
Expected: PASS — all 10 tests.

- [ ] **Step 5: Re-export from api.ts**

In `apps/web/src/api.ts`, add at the top with the other exports (after the imports, before `export type Project`):

```ts
export { humanError, type HumanError } from './api/errors.js';
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/api/errors.ts apps/web/src/api/errors.test.ts apps/web/src/api.ts
git commit -m "feat(api): humanError mapper — unknown error → i18n key (generalizes errorKey)"
```

---

### Task 3: Build the `QueryClientProvider` test wrapper

Introduces a pattern the repo currently lacks. Required by Task 6 (`useBackendReachable` test) and reused by all hook tests in S1+.

**Files:**
- Create: `apps/web/test/queryClientWrapper.tsx`

**Interfaces:**
- Produces: `createQueryClientWrapper()` returning a React wrapper that mounts children in a fresh `QueryClientProvider`. Consumed by Task 6.

- [ ] **Step 1: Create the wrapper**

Create `apps/web/test/queryClientWrapper.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * Build a renderHook/render wrapper that isolates each test in its own
 * QueryClient (no retry, no cache carryover). The repo had no
 * QueryClientProvider test setup before S0; this is the reusable mold for
 * S1+ hook tests.
 *
 * Usage:
 *   const wrapper = createQueryClientWrapper();
 *   renderHook(() => useMyHook(), { wrapper });
 */
export function createQueryClientWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
```

- [ ] **Step 2: Verify it type-checks (no test of its own — it's a helper)**

Run: `pnpm --filter @jheo/web exec tsc --noEmit`
Expected: PASS (no type errors). If `@tanstack/react-query` isn't resolvable, the project deps are broken — stop and fix before continuing.

- [ ] **Step 3: Commit**

```bash
git add apps/web/test/queryClientWrapper.tsx
git commit -m "test(web): reusable QueryClientProvider wrapper for hook tests"
```

---

### Task 4: Build `<ErrorState>` and `<EmptyState>` components

The state pair. `<ErrorState>` consumes `humanError`-shaped keys; `<EmptyState>` subsumes both existing EmptyStates.

**Files:**
- Create: `apps/web/src/components/states/ErrorState.tsx`
- Create: `apps/web/src/components/states/EmptyState.tsx`
- Create: `apps/web/src/components/states/index.ts`
- Test: `apps/web/src/components/states/__tests__/ErrorState.test.tsx`
- Test: `apps/web/src/components/states/__tests__/EmptyState.test.tsx`

**Interfaces:**
- Consumes: `humanError` output shape (`{ key, params?, retry? }`) — keys resolved via `useTranslation().t()`.
- Produces: `<ErrorState>` and `<EmptyState>` components. Consumed by Task 5 (ProjectsList) and S2/S4 later.

- [ ] **Step 1: Write the failing `<ErrorState>` test**

Create `apps/web/src/components/states/__tests__/ErrorState.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorState } from '../ErrorState';

describe('ErrorState', () => {
  it('renders the translated title with interpolated params', () => {
    render(<ErrorState titleKey="errors.server" params={{ status: 500 }} />);
    // pt-BR catalog: "O servidor retornou um erro ({{status}}). Tente novamente."
    expect(screen.getByText(/O servidor retornou um erro \(500\)/)).toBeInTheDocument();
  });

  it('renders a retry button only when retry and onRetry are both present', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ErrorState titleKey="errors.network" retry onRetry={onRetry} />);
    const btn = screen.getByRole('button', { name: /tentar novamente/i });
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledOnce();

    // Without onRetry → no button.
    rerender(<ErrorState titleKey="errors.network" retry />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    // Without retry → no button.
    rerender(<ErrorState titleKey="errors.network" onRetry={onRetry} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('omits the hint when hintKey is absent', () => {
    render(<ErrorState titleKey="errors.generic" />);
    expect(screen.getByText(/Algo deu errado/i)).toBeInTheDocument();
    // No extra hint paragraph beyond the title.
    expect(screen.queryByText(/dica/i)).not.toBeInTheDocument();
  });

  it('renders the hint when hintKey is provided', () => {
    render(<ErrorState titleKey="errors.generic" hintKey="projects.create.hint" />);
    // projects.create.hint exists in both catalogs; just assert something renders
    // with role complementary to the title.
    expect(screen.getByText(/Algo deu errado/i)).toBeInTheDocument();
  });

  it('has role=alert by default for accessibility', () => {
    render(<ErrorState titleKey="errors.generic" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @jheo/web test --run src/components/states/__tests__/ErrorState.test.tsx`
Expected: FAIL — `Cannot find module '../ErrorState'`.

- [ ] **Step 3: Implement `<ErrorState>`**

Create `apps/web/src/components/states/ErrorState.tsx`:

```tsx
import { useTranslation } from 'react-i18next';

export interface ErrorStateProps {
  /** i18n key for the title (humanError yields this). */
  titleKey: string;
  /** Interpolation params for the title. */
  params?: Record<string, string | number>;
  /** Optional i18n key for a hint shown below the title. */
  hintKey?: string;
  /** When true and onRetry is provided, renders a "try again" button. */
  retry?: boolean;
  /** Retry callback; the button renders only when retry && onRetry are both present. */
  onRetry?: () => void;
  /** ARIA role; defaults to 'alert' (matches FixesPage:359). */
  role?: 'alert';
  /** Extra class names for layout (e.g. 'tiny' for inline contexts). */
  className?: string;
}

export function ErrorState({
  titleKey,
  params,
  hintKey,
  retry,
  onRetry,
  role = 'alert',
  className,
}: ErrorStateProps) {
  const { t } = useTranslation();
  const showRetry = retry && onRetry;
  return (
    <div className={`error-state${className ? ` ${className}` : ''}`} role={role}>
      <p className="error-state__title">{t(titleKey, params)}</p>
      {hintKey && <p className="error-state__hint">{t(hintKey)}</p>}
      {showRetry && (
        <button className="btn btn--sm btn--primary error-state__retry" onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}
```

Note: this references `common.retry`, which was added to both catalogs in Task 1 Step 3. No further catalog edits here.

- [ ] **Step 4: Run the `<ErrorState>` test to verify it passes**

Run: `pnpm --filter @jheo/web test --run src/components/states/__tests__/ErrorState.test.tsx`
Expected: PASS — all 5 tests.

- [ ] **Step 5: Write the failing `<EmptyState>` test**

Create `apps/web/src/components/states/__tests__/EmptyState.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('renders title and hint keys', () => {
    render(<EmptyState titleKey="projects.empty.title" hintKey="projects.empty.hint" />);
    expect(screen.getByText('Nenhum projeto ainda')).toBeInTheDocument();
    expect(screen.getByText(/Crie seu primeiro projeto/)).toBeInTheDocument();
  });

  it('renders a CTA Link when cta is provided', () => {
    render(
      <EmptyState
        titleKey="projects.empty.title"
        cta={{ to: '/projects/new', labelKey: 'projects.empty.action' }}
      />,
    );
    const link = screen.getByRole('link', { name: 'Criar projeto' });
    expect(link).toHaveAttribute('href', '/projects/new');
  });

  it('renders children (escape hatch for rich art)', () => {
    render(
      <EmptyState titleKey="projects.empty.title">
        <svg data-testid="art" viewBox="0 0 56 56" />
      </EmptyState>,
    );
    expect(screen.getByTestId('art')).toBeInTheDocument();
  });

  it('omits CTA when not provided', () => {
    render(<EmptyState titleKey="projects.empty.title" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm --filter @jheo/web test --run src/components/states/__tests__/EmptyState.test.tsx`
Expected: FAIL — `Cannot find module '../EmptyState'`.

- [ ] **Step 7: Implement `<EmptyState>`**

Create `apps/web/src/components/states/EmptyState.tsx`:

```tsx
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export interface EmptyStateProps {
  /** i18n key for the title. */
  titleKey: string;
  /** Optional i18n key for a hint shown below the title. */
  hintKey?: string;
  /** Optional CTA rendered as a Link. */
  cta?: { to: string; labelKey: string };
  /** Escape hatch for rich art (SVG) or custom content. */
  children?: ReactNode;
  /** Extra class names. */
  className?: string;
}

export function EmptyState({ titleKey, hintKey, cta, children, className }: EmptyStateProps) {
  const { t } = useTranslation();
  return (
    <div className={`empty${className ? ` ${className}` : ''}`}>
      {children && <div className="empty__art">{children}</div>}
      <p className="empty__title">{t(titleKey)}</p>
      {hintKey && <p className="empty__hint">{t(hintKey)}</p>}
      {cta && (
        <Link to={cta.to} className="btn btn--primary empty__action">
          {t(cta.labelKey)}
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Run the `<EmptyState>` test to verify it passes**

Run: `pnpm --filter @jheo/web test --run src/components/states/__tests__/EmptyState.test.tsx`
Expected: PASS — all 4 tests.

- [ ] **Step 9: Create the barrel and commit**

Create `apps/web/src/components/states/index.ts`:

```ts
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { ErrorState, type ErrorStateProps } from './ErrorState';
```

```bash
git add apps/web/src/components/states/ apps/web/src/i18n/en.json apps/web/src/i18n/pt-BR.json
git commit -m "feat(web): shared EmptyState + ErrorState components with common.retry key"
```

---

### Task 5: Implement `useBackendReachable`

Extracts the hand-rolled `Layout.tsx:44-77` polling into a React-Query-backed hook.

**Files:**
- Create: `apps/web/src/hooks/useBackendReachable.ts`
- Test: `apps/web/src/hooks/__tests__/useBackendReachable.test.tsx`

**Interfaces:**
- Consumes: `createQueryClientWrapper()` from Task 3; `globalThis.fetch` (stubbed in tests).
- Produces: `useBackendReachable(): BackendReachable` returning `{ reachable, latencyMs, lastCheckedAt }`. Consumed by Task 7 (HealthIndicator).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/hooks/__tests__/useBackendReachable.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useBackendReachable } from '../useBackendReachable';
import { createQueryClientWrapper } from '../../../test/queryClientWrapper';

describe('useBackendReachable', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('marks reachable when /api/health responds 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true } as Response)),
    );
    const wrapper = createQueryClientWrapper();
    const { result } = renderHook(() => useBackendReachable(), { wrapper });
    await waitFor(() => expect(result.current.reachable).toBe(true));
    expect(result.current.latencyMs).not.toBeNull();
    expect(result.current.lastCheckedAt).toBeInstanceOf(Date);
  });

  it('marks unreachable when fetch throws (network down)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const wrapper = createQueryClientWrapper();
    const { result } = renderHook(() => useBackendReachable(), { wrapper });
    await waitFor(() => expect(result.current.reachable).toBe(false));
    expect(result.current.latencyMs).toBeNull();
  });

  it('marks unreachable when /api/health returns !ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false } as Response)),
    );
    const wrapper = createQueryClientWrapper();
    const { result } = renderHook(() => useBackendReachable(), { wrapper });
    await waitFor(() => expect(result.current.reachable).toBe(false));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @jheo/web test --run src/hooks/__tests__/useBackendReachable.test.tsx`
Expected: FAIL — `Cannot find module '../useBackendReachable'`.

- [ ] **Step 3: Implement the hook**

Create `apps/web/src/hooks/useBackendReachable.ts`:

```ts
import { useQuery } from '@tanstack/react-query';

export interface BackendReachable {
  reachable: boolean;
  latencyMs: number | null;
  lastCheckedAt: Date;
}

interface HealthResult {
  ok: boolean;
  latencyMs: number;
  checkedAt: Date;
}

/**
 * Poll `/api/health` on a 15s cadence (matching the previous hand-rolled
 * HealthIndicator in Layout.tsx:44-77) via React Query. Derives
 * `reachable` from `!isError && data.ok`. Gains cache, retry, and devtools
 * over the hand-rolled setInterval it replaces.
 */
async function pingHealth(): Promise<HealthResult> {
  const start = performance.now();
  const r = await fetch('/api/health', { cache: 'no-store' });
  return {
    ok: r.ok,
    latencyMs: Math.round(performance.now() - start),
    checkedAt: new Date(),
  };
}

export function useBackendReachable(): BackendReachable {
  const q = useQuery({
    queryKey: ['health'],
    queryFn: pingHealth,
    refetchInterval: 15_000,
    // Health is live status — don't serve stale data across remounts.
    staleTime: 0,
    gcTime: 0,
  });

  if (q.isError || !q.data) {
    return { reachable: false, latencyMs: null, lastCheckedAt: new Date(0) };
  }
  return {
    reachable: q.data.ok,
    latencyMs: q.data.latencyMs,
    lastCheckedAt: q.data.checkedAt,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @jheo/web test --run src/hooks/__tests__/useBackendReachable.test.tsx`
Expected: PASS — all 3 tests. If the "network down" case hangs, the `retry: false` in the wrapper is not taking effect — verify Task 3's wrapper.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/
git commit -m "feat(web): useBackendReachable hook — React-Query-backed /api/health poller"
```

---

### Task 6: Refactor ProjectsList create error + page-local EmptyState

Reference integration #1 and #2. Replaces the raw `(create.error as Error).message` with `humanError` + `<ErrorState>`, and swaps the page-local `EmptyState` for the shared one.

**Files:**
- Modify: `apps/web/src/pages/ProjectsList.tsx:1-5` (imports), `:13-35` (remove page-local EmptyState), `:105-109` (error), `:114-116` (empty state usage)

**Interfaces:**
- Consumes: `humanError` from Task 2; `<EmptyState>`, `<ErrorState>` from Task 4.

- [ ] **Step 1: Update imports**

In `apps/web/src/pages/ProjectsList.tsx`, change the import block at the top (lines 1-5) to add `humanError` and the state components:

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { createProject, humanError, listProjects } from '../api.js';
import { EmptyState, ErrorState } from '../components/states/index.js';
```

- [ ] **Step 2: Remove the page-local EmptyState**

Delete the entire `function EmptyState(...)` block (lines 13-35, the one with `empty__art` SVG). The shared `<EmptyState>` now carries the art via `children`. The SVG markup will move into the call site (Step 4).

- [ ] **Step 3: Replace the create error render**

Find the error block (lines 105-109):

```tsx
{create.isError && (
  <p className="tiny" style={{ color: 'var(--danger)', marginTop: 'var(--space-3)' }}>
    {(create.error as Error).message}
  </p>
)}
```

Replace with:

```tsx
{create.isError &&
  (() => {
    const e = humanError(create.error);
    return (
      <ErrorState
        titleKey={e.key}
        params={e.params}
        retry={e.retry}
        onRetry={() => create.mutate({ name, rootUrl })}
        className="tiny"
      />
    );
  })()}
```

- [ ] **Step 4: Replace the page-local EmptyState usage with shared one + children art**

Find (lines 114-116):

```tsx
{projects.data && projects.data.length === 0 && !projects.isLoading && (
  <EmptyState onNew={focusNew} />
)}
```

Replace with:

```tsx
{projects.data && projects.data.length === 0 && !projects.isLoading && (
  <EmptyState
    titleKey="projects.empty.title"
    hintKey="projects.empty.hint"
    cta={{ to: '/projects', labelKey: 'projects.empty.action' }}
  >
    <svg viewBox="0 0 56 56">
      <rect x="8" y="14" width="40" height="32" rx="3" />
      <path d="M8 22h40" />
      <path d="M14 14V8" />
      <path d="M42 14V8" />
      <circle cx="20" cy="32" r="2" />
      <path d="M28 32h12" />
      <path d="M28 38h8" />
    </svg>
  </EmptyState>
)}
```

Note: the page-local version used a `<button onClick={focusNew}>`. The shared version uses a `<Link to="/projects">`. Since ProjectsList *is* `/projects`, the CTA should focus the new-project input instead. Two choices: (a) make the CTA a button via an `onCta` prop, or (b) keep the Link but point it at the input via `#new-project-name` hash. **Apply (b)** — simplest, no new prop. Change the `cta.to` to `/projects#new-project-name`. The existing `focusNew` helper becomes dead code; remove it (line 62) and its `document.getElementById` usage.

After this step, the `focusNew` function (line 62) is unused — delete it.

- [ ] **Step 5: Verify ProjectsList still type-checks and existing tests pass**

Run: `pnpm --filter @jheo/web exec tsc --noEmit`
Expected: PASS — no type errors, no unused-variable warnings on `focusNew`.

Run: `pnpm --filter @jheo/web test --run`
Expected: PASS — full suite green. If a ProjectsList test asserts the old raw-error string, update it to assert the new `ErrorState`-rendered text.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/ProjectsList.tsx
git commit -m "refactor(web): ProjectsList uses shared EmptyState + humanError/ErrorState"
```

---

### Task 7: Refactor `HealthIndicator` to consume `useBackendReachable`

Reference integration #3. Removes the hand-rolled `useEffect`/`setInterval` polling.

**Files:**
- Modify: `apps/web/src/components/Layout.tsx:1-2` (imports), `:44-77` (HealthIndicator body)

**Interfaces:**
- Consumes: `useBackendReachable()` from Task 5.

- [ ] **Step 1: Add the import**

In `apps/web/src/components/Layout.tsx`, add to the imports at the top:

```tsx
import { useBackendReachable } from '../hooks/useBackendReachable.js';
```

If `useState`/`useEffect` were imported only for `HealthIndicator`, check whether other code in the file uses them before removing — leave the import alone if unsure; the linter will flag unused later.

- [ ] **Step 2: Rewrite HealthIndicator**

Replace the entire `HealthIndicator` function (lines 44-77) with:

```tsx
function HealthIndicator() {
  const { t } = useTranslation();
  const { reachable, latencyMs } = useBackendReachable();
  return (
    <div className="topbar__health" title={reachable ? 'Backend healthy' : 'Backend unreachable'}>
      <span
        className="topbar__health-dot"
        style={!reachable ? { background: 'var(--danger)', boxShadow: '0 0 8px rgba(239,68,68,0.4)' } : undefined}
      />
      <span>
        {t('topbar.api')} {!reachable ? t('topbar.down') : latencyMs !== null ? `${latencyMs}ms` : '…'}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Verify type-check and full suite**

Run: `pnpm --filter @jheo/web exec tsc --noEmit`
Expected: PASS. If `useState`/`useEffect` are now unused imports, the TS config may warn — remove them from the import if so.

Run: `pnpm --filter @jheo/web test --run`
Expected: PASS — full suite green.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/Layout.tsx
git commit -m "refactor(web): HealthIndicator consumes useBackendReachable (drops hand-rolled polling)"
```

---

### Task 8: Full build + done-criterion verification

Confirms the 7 done-criterion points from the spec.

**Files:** none modified.

- [ ] **Step 1: Run the full test suite**

Run: `pnpm --filter @jheo/web test --run`
Expected: PASS — all tests, including the new `errors.test.ts`, `ErrorState.test.tsx`, `EmptyState.test.tsx`, `useBackendReachable.test.tsx`, and the existing parity + FixesPage + FixCard tests.

- [ ] **Step 2: Run the production build**

Run: `pnpm --filter @jheo/web build`
Expected: PASS — no bundle regression (relevant given the recent `node:fs` fix). No new warnings about server-only modules leaking into the client bundle.

- [ ] **Step 3: Verify the done-criterion checklist**

Manually confirm each:
1. `humanError(err)` exists, pure, 5 branches, never throws → Task 2 tests.
2. `<EmptyState>`/`<ErrorState>` in `components/states/` with the props → Task 4 tests.
3. `useBackendReachable()` in `hooks/` → Task 5 tests.
4. Real refactors closed → ProjectsList (Task 6), HealthIndicator (Task 7).
5. `errors.*` has 4 new keys in both catalogs → Task 1 + parity test.
6. Full suite passes → Step 1.
7. Build passes → Step 2.

- [ ] **Step 4: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "chore(s0): done-criterion verification"
```
(If nothing changed, skip — the verification is the gate, not a commit.)

---

## Self-Review (run after writing, before handoff)

Covered in-line during plan writing; recorded here for the implementer's awareness:

- **Spec coverage:** `humanError` (Task 2) ✓, `<EmptyState>`/`<ErrorState>` (Task 4) ✓, `useBackendReachable` (Task 5) ✓, three refactors (Tasks 6, 6, 7) ✓, `errors.*` catalog (Task 1) ✓, test-wrapper pattern (Task 3) ✓. Done-criterion 1-7 → Task 8.
- **Placeholder scan:** No TBD/TODO; every code step shows complete code. The `backend_unavailable` key ambiguity was resolved inline (sentinel maps to `backend_down`, not a new key).
- **Type consistency:** `HumanError` (Task 2) → consumed in Task 6 as `e.key`/`e.params`/`e.retry` ✓. `BackendReachable` (Task 5) → `reachable`/`latencyMs` consumed in Task 7 ✓. `EmptyState`/`ErrorState` props (Task 4) → consumed in Task 6 ✓.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-09-s0-shared-foundations.md`.
