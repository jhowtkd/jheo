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
