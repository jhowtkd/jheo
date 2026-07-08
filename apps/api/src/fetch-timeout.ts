/** Default timeout for outbound LLM / publish / GSC fetches. */
export const DEFAULT_OUTBOUND_TIMEOUT_MS = 30_000;

/**
 * Wrap `fetch` so every call gets an AbortSignal.timeout when the caller
 * did not supply one. Prevents hung providers from pinning BullMQ workers
 * and Fastify request handlers indefinitely.
 */
export function withFetchTimeout(
  fetchFn: typeof fetch,
  timeoutMs = DEFAULT_OUTBOUND_TIMEOUT_MS,
): typeof fetch {
  return (input, init) => {
    if (init?.signal) return fetchFn(input, init);
    const signal =
      typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
        ? AbortSignal.timeout(timeoutMs)
        : undefined;
    return fetchFn(input, signal ? { ...init, signal } : init);
  };
}
