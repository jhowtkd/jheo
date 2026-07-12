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

// Sentinel name -> i18n key. The sentinel and key need not match: the
// `backend_unavailable` sentinel reuses the existing `errors.backend_down`
// key rather than introducing a duplicate catalog entry.
const SENTINEL_KEYS: Record<string, string> = {
  no_llm_provider: 'errors.no_llm_provider',
  rate_limited: 'errors.rate_limited',
  backend_unavailable: 'errors.backend_down',
};

// Matches api.ts's "Failed to load health: 500" / "Failed to load page: 404" pattern.
const STATUS_RE = /^Failed to load .*: (\d+)$/;

export function humanError(err: unknown): HumanError {
  if (!(err instanceof Error)) return { key: 'errors.generic' };

  // Branch 1: sentinel code in the message (e.g. new Error('rate_limited')).
  const sentinelKey = SENTINEL_KEYS[err.message];
  if (sentinelKey !== undefined) {
    return { key: sentinelKey };
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

  // Branch 4: empty proxy 500 -> r.json() threw SyntaxError on empty body.
  // Transient: dies in S1 when the proxy returns 503 { error: 'backend_unavailable' }.
  if (err instanceof SyntaxError) {
    return { key: 'errors.backend_down', retry: true };
  }

  // Branch 5: fallback.
  return { key: 'errors.generic' };
}
