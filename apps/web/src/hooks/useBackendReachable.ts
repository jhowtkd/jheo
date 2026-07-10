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
