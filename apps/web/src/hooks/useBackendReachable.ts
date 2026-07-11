import { useQuery } from '@tanstack/react-query';

export interface BackendReachable {
  status: 'pending' | 'reachable' | 'down';
  reachable: boolean; // status === 'reachable'
  latencyMs: number | null;
  lastCheckedAt: Date; // epoch (new Date(0)) while pending/down
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
