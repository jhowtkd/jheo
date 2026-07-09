# S0 — Shared Foundations (Design)

- **Date:** 2026-07-09
- **Status:** Draft — awaiting user review
- **Kind:** Milestone spec (first of five under the UX program umbrella)
- **Umbrella:** `docs/superpowers/specs/2026-07-09-ux-program-design.md`
- **Audit items touched:** client side of A2; root cause of B4/B5/D8; prep for B1/B2/B3/B11
- **Baseline:** clean tree at `f4b60bd`

## TL;DR

S0 builds the three cross-cutting primitives that S1–S4 consume: an error mapper (`humanError`), a reusable state component pair (`<EmptyState>`/`<ErrorState>`), and a backend-reachability hook (`useBackendReachable`). Each is wired into one **real existing site** as its reference integration — not a demo — which proves the frozen contracts against live shapes and removes existing duplication (a hand-rolled `HealthIndicator`, a page-local `EmptyState`) as a side effect. S0 implements no audit items outright; it prepares the ground so S1 can roll the primitives out across every error surface without reinventing them.

Three decisions shaped this spec (made during brainstorming):
1. **`humanError` returns an i18n key, not a string** — matches the existing `errorKey()` precedent in `FindingList.tsx:31` and the key-parity test. Pure, testable without i18n init, locale-agnostic.
2. **Split placement by concern** — `humanError` in the api layer (it normalizes what `api.ts` throws), the hook in a new `hooks/` dir, the components in `components/states/`. Fits the team's "domain folders" convention rather than inventing a `shared/` layer.
3. **Reference integrations are real refactors** — each primitive replaces existing code rather than living on a throwaway page, so the frozen interfaces survive a real consumer before S1 depends on them.

## What this milestone is and isn't

**Is:** the three primitives, their frozen interfaces, three real refactors that consume them, the extended `errors.*` catalog, and the test patterns that prove them — including a `QueryClientProvider` test wrapper that the repo currently lacks and that S1–S4 will reuse.

**Isn't:** a rollout. S0 proves each primitive on one site only. S1 rolls `humanError` across all mutation/query error surfaces (B4, B5); S2 applies `<EmptyState>`/`<ErrorState>` to Templates/Settings/Projects (B1, B2, B3); S1 wires the proxy 503 + `useBackendReachable` retry UX (A2). S0 touching more than one site per primitive would steal scope from those milestones.

## The three primitives (frozen contracts)

### `humanError(err: unknown): HumanError`

**Location:** `apps/web/src/api/errors.ts`, re-exported from `apps/web/src/api.ts`.

```ts
export interface HumanError {
  key: string;                          // always an i18n key, e.g. 'errors.server'
  params?: Record<string, string | number>; // interpolation for t(), e.g. { status }
  retry?: boolean;                      // true when "try again" makes sense
}
export function humanError(err: unknown): HumanError;
```

**Decision order** (first match wins):

| # | Condition | Result |
|---|---|---|
| 1 | `err` is `Error` whose `message` is a known sentinel (`no_llm_provider`, `rate_limited`, `backend_unavailable`) | `{ key: 'errors.<sentinel>' }` |
| 2 | `err` is `Error` whose `message` matches `^Failed to load .*: (\d+)$` (the `api.ts:117,144,…` pattern) | `{ key: 'errors.server', params: { status }, retry: status >= 500 }` |
| 3 | `err` is a `TypeError` (fetch threw — network down) | `{ key: 'errors.network', retry: true }` |
| 4 | `err` is a `SyntaxError` ("Unexpected end of JSON input" — empty proxy 500) | `{ key: 'errors.backend_down', retry: true }` |
| 5 | fallback (anything else, including `null`/`undefined`/non-Error) | `{ key: 'errors.generic' }` |

Generalizes the existing `errorKey()` in `FindingList.tsx:31-34` beyond the two translation sentinels. **Pure, deterministic, never throws, never calls `t()`** — the caller does `const e = humanError(err); <ErrorState titleKey={e.key} params={e.params} retry={e.retry} onRetry={refetch} />`. Branch #4 is transient: it dies in S1 when the proxy starts returning 503 with `{error:'backend_unavailable'}` (branch #1 then catches it).

### `<EmptyState>` / `<ErrorState>`

**Location:** `apps/web/src/components/states/` (domain subfolder, parity with `components/fixes/`).

```ts
// Subsumes both existing EmptyStates (ProjectsList page-local + EmptyFixesState)
export function EmptyState(props: {
  kind?: string;                        // discriminant for COPY default, like EmptyFixesState
  titleKey?: string;                    // override default title for kind
  hintKey?: string;                     // override hint
  cta?: { to: string; labelKey: string }; // optional Link button
  children?: React.ReactNode;           // escape hatch (e.g. rich SVG art)
  className?: string;
}): JSX.Element;

export function ErrorState(props: {
  titleKey: string;                     // always an i18n key (humanError yields this)
  params?: Record<string, string | number>;
  hintKey?: string;
  retry?: boolean;
  onRetry?: () => void;                 // retry button renders only when retry && onRetry are both present
  role?: 'alert';                       // default 'alert' (matches FixesPage:359)
  className?: string;
}): JSX.Element;
```

The two are designed to fit `humanError` naturally but without hard coupling — `ErrorState` accepts raw keys too. `<EmptyState>` carries the `kind`+COPY-record idiom from `EmptyFixesState` plus the `children` escape hatch so it can render the rich `empty__art` SVG currently living in the ProjectsList page-local version (which it subsumes).

### `useBackendReachable(): BackendReachable`

**Location:** `apps/web/src/hooks/useBackendReachable.ts` (creates `hooks/`; justified because more hooks follow and `useDataTranslations` is currently misfiled under `i18n/` only because it's translation-specific).

```ts
export interface BackendReachable {
  reachable: boolean;
  latencyMs: number | null;
  lastCheckedAt: Date;
}
export function useBackendReachable(): BackendReachable;
```

**Implementation:** `useQuery({ queryKey: ['health'], queryFn: ping, refetchInterval: 15_000 })` where `ping` does `fetch('/api/health', { cache: 'no-store' })`, measures latency, and returns the shape. Derives `reachable` from `!isError && data.ok`. This **extracts exactly the logic hand-rolled in `Layout.tsx:44-77`** — same 15s cadence, same "down = !ok OR thrown" derivation — but via React Query (gains cache, retry, devtools, and a single source of truth).

## Reference integrations (real refactors, not demos)

### Refactor 1 — `humanError` + `<ErrorState>` on ProjectsList create form

Today (`pages/ProjectsList.tsx:105-107`):
```tsx
create.isError && <p className="tiny" style={{color:'var(--danger)'}}>
  {(create.error as Error).message}
</p>
```

After:
```tsx
create.isError && (() => {
  const e = humanError(create.error);
  return <ErrorState titleKey={e.key} params={e.params} retry={e.retry}
           onRetry={() => create.mutate()} className="tiny" />;
})()
```

**Why this site:** it is the `05-after-create.png` audit case — the "Unexpected end of JSON input" leak (audit B5 at its origin). Proves `humanError` against React Query's `unknown`-shaped `error`, and proves `ErrorState` in an inline form context.

### Refactor 2 — shared `<EmptyState>` replacing ProjectsList's page-local one

Today there is a page-local `EmptyState` in `pages/ProjectsList.tsx:13` (richer, unexported, with `empty__art` SVG + `empty__title` + `empty__hint` + `empty__action`). After: ProjectsList imports the shared `<EmptyState>`, passes `kind="projects-empty"` + `cta={{ to: '/projects/new', labelKey: 'projects.empty.cta' }}`. The rich art migrates into the shared `<EmptyState>` via `children`.

**Why this site:** proves the shared primitive genuinely *subsumes* the page-local one — if it can't render ProjectsList's rich art, the contract needs another field, and better to find out now. Removes the duplication (page-local ceases to exist).

### Refactor 3 — `useBackendReachable` extracting `HealthIndicator`

Today (`components/Layout.tsx:44-77`): 25+ lines of `useEffect` + `setInterval(ping, 15000)` + `useState` for `latencyMs`/`down` + manual cleanup.

After:
```tsx
function HealthIndicator() {
  const { t } = useTranslation();
  const { reachable, latencyMs } = useBackendReachable();
  return (
    <div className="topbar__health" title={...}>
      <span className="topbar__health-dot" style={!reachable ? { background: 'var(--danger)', boxShadow: '…' } : undefined} />
      <span>{t('topbar.api')} {!reachable ? t('topbar.down') : latencyMs !== null ? `${latencyMs}ms` : '…'}</span>
    </div>
  );
}
```

**Why this site:** the most obvious consumer — `HealthIndicator` is already a hand-rolled version of the hook. Extraction is a direct win: less code, React Query cache/retry/devtools, single source of truth for `/api/health` polling.

## Extended `errors.*` catalog

Today (`i18n/en.json` + `pt-BR.json`) the `errors` namespace has 3 keys: `generic`, `no_llm_provider`, `rate_limited`. S0 adds four keys to **both** catalogs (the `i18n/parity.test.ts` test forces parity):

| Key | Interpolation | Fires when |
|---|---|---|
| `errors.network` | — | fetch threw `TypeError` (network down) |
| `errors.server` | `{{status}}` | "Failed to load X: 500" pattern from `api.ts` |
| `errors.backend_down` | — | "Unexpected end of JSON input" (empty proxy 500) |
| `errors.notFound` | — | 404 (preparation; matches nothing today but S1 may use it) |

The `backend_unavailable` sentinel that S1's proxy 503 will emit does **not** get a new key in S0 — it falls under `errors.backend_down` by name. When S1 introduces the body `{error:'backend_unavailable'}`, `humanError` recognizes the sentinel and maps it to the same key. No contract change in S1.

## Testing strategy (introduces a new repo pattern)

The web test stack is vitest + jsdom + @testing-library/react, `globals: false`, `test/setup.ts` runs `ensureI18n()` defaulting to pt-BR before tests. The repo **has no test that mounts a `QueryClientProvider` today.** S0 introduces that pattern — it becomes the mold for S1–S4 hooks.

**`humanError`** — pure unit test, no i18n, no React. Assertions on `result.key`:
```ts
expect(humanError(new Error('no_llm_provider')).key).toBe('errors.no_llm_provider');
expect(humanError(new Error('Failed to load health: 500')))
  .toEqual({ key: 'errors.server', params: { status: 500 }, retry: true });
expect(humanError(new TypeError('Failed to fetch'))).toEqual({ key: 'errors.network', retry: true });
expect(humanError(new SyntaxError('Unexpected end of JSON input'))).toEqual({ key: 'errors.backend_down', retry: true });
expect(humanError('whatever')).toEqual({ key: 'errors.generic' });
expect(humanError(null)).toEqual({ key: 'errors.generic' });  // never throws
```

**`<EmptyState>` / `<ErrorState>`** — RTL render asserting pt-BR strings (setup.ts already initializes pt-BR), mirroring `FixCard.test.tsx`:
```tsx
render(<ErrorState titleKey="errors.server" params={{status:500}} retry onRetry={fn} />);
expect(screen.getByText(/Falha ao carregar.*500/)).toBeInTheDocument();
expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
```

**`useBackendReachable`** — `renderHook` inside a fresh `QueryClientProvider` wrapper (the new pattern), stubbing `globalThis.fetch`:
```tsx
function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

it('marca reachable quando /api/health responde 200', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })));
  const { result } = renderHook(() => useBackendReachable(), { wrapper });
  await waitFor(() => expect(result.current.reachable).toBe(true));
  expect(result.current.latencyMs).not.toBeNull();
});

it('marca unreachable quando fetch lança', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
  const { result } = renderHook(() => useBackendReachable(), { wrapper });
  await waitFor(() => expect(result.current.reachable).toBe(false));
});
```

The wrapper lives in a reusable helper (e.g. `test/queryClientWrapper.tsx`) so S1–S4 hooks reuse it. **Parity test** — the existing `i18n/parity.test.ts` automatically enforces the 4 new `errors.*` keys in both catalogs; forgetting one fails the build.

## Done-criterion

S0 is done when **all** are true:

1. `humanError(err)` exists, is pure, maps the 5 decision branches, never throws. Unit test covers each.
2. `<EmptyState>` and `<ErrorState>` exist in `components/states/` with the props above. RTL tests cover render + CTA + retry.
3. `useBackendReachable()` exists in `hooks/`, returns `{ reachable, latencyMs, lastCheckedAt }`. Test with `QueryClientProvider` wrapper proves reachable/unreachable.
4. **Real refactors closed:** ProjectsList create-form renders `<ErrorState>` (not a raw string); ProjectsList uses shared `<EmptyState>` (page-local removed); `HealthIndicator` consumes `useBackendReachable` (the `useEffect`/`setInterval` is gone).
5. `errors.*` catalog has the 4 new keys in `en.json` and `pt-BR.json`. Parity test passes.
6. Full web test suite passes (`pnpm --filter @jheo/web test --run`).
7. `pnpm --filter @jheo/web build` passes (no bundle regression — relevant given the recent `node:fs` fix).

The umbrella's acceptance ("the three primitives exist, tested, each with a reference integration") becomes these seven checkable points.

## Risks

1. **`HealthIndicator` refactor changes observable behavior.** Today it does an immediate `ping()` on mount + `setInterval`. React Query also fetches on mount, but re-render timing may differ (the dot may flicker differently). *Mitigation:* test covers the initial state; if flicker bothers, `staleTime` adjusts. Low risk — visual only.
2. **`humanError` pattern-matches on message strings.** If `api.ts` changes format (`"Failed to load X: 500"` → something else), the regex breaks silently and falls back to `errors.generic`. *Mitigation:* a test using the exact string from `api.ts:117` documents the expected format and breaks if it changes. S1 should migrate `api.ts` to throw structured errors (`class ApiError extends Error { code; status }`); `humanError` then gains a `code` branch and loses the regex. The S0 design survives that migration (branch #1 already reads "codes").
3. **Subsuming ProjectsList's page-local `EmptyState` may expose a contract gap.** If the rich art (SVG `empty__art`) doesn't fit the shared `<EmptyState>` via `children`, the contract needs another field. *Mitigation:* that is exactly the point of the reference refactor — discovering this now is success. The contract already includes `children?: React.ReactNode` as an escape hatch.
4. **Introducing the `QueryClientProvider` test wrapper is a new pattern.** No one in the repo has done it. *Mitigation:* the wrapper is ~5 lines, lives in a reusable test helper, and the `useBackendReachable` example documents its use. Becomes the mold for S1+ hooks.

## Open question deferred to S1

`humanError` today maps `Error` by *message string*. The clean path is for S1 to make `api.ts` throw structured errors (`class ApiError extends Error { code: string; status: number }`) and have `humanError` read `err.code` instead of regex-matching. **S0 does not do this migration** — it only designs `humanError` to survive it (the sentinel branch already reads "codes"; when `ApiError.code` arrives, the mapper gains a branch and drops the regex). S1 decides whether/when to migrate.

## Next step

This spec approved → invoke writing-plans to produce the implementation plan for S0 → implement → S1 brainstorm.
