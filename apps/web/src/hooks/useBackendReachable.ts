import { useQuery } from '@tanstack/react-query';

export interface BackendReachable {
  status: 'pending' | 'reachable' | 'down';
  reachable: boolean; // status === 'reachable'
  latencyMs: number | null;
  lastCheckedAt: Date; // epoch (new Date(0)) while pending/down
}

interface HealthResult {
  ok: boolean;
  latencyMs: number;
  checkedAt: Date;
}

/**
 * Poll `/api/health` on a 15s cadence (matching the previous hand-rolled
 * HealthIndicator in Layout.tsx:44-77) via React Query. Gains cache, retry,
 * and devtools over the hand-rolled setInterval it replaces.
 *
 * Three-state status avoids the red-flash-on-mount regression: React Query
 * starts in a pending state (no data, no error), which previously collapsed
 * into `reachable: false` and showed a red "down" dot until the first fetch
 * resolved. `pending` is now distinct from `down` so consumers can render a
 * neutral indicator before the first response arrives.
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

  if (q.isPending) {
    return { status: 'pending', reachable: false, latencyMs: null, lastCheckedAt: new Date(0) };
  }
  if (q.isError || !q.data) {
    return { status: 'down', reachable: false, latencyMs: null, lastCheckedAt: new Date(0) };
  }
  return {
    status: q.data.ok ? 'reachable' : 'down',
    reachable: q.data.ok,
    latencyMs: q.data.latencyMs,
    lastCheckedAt: q.data.checkedAt,
  };
}
