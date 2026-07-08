import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Avoid refetch-on-remount storms for stable list/detail data.
      // Live progress queries override with a shorter staleTime / interval.
      staleTime: 30_000,
    },
  },
});
