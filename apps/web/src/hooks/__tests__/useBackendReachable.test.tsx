import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useBackendReachable } from '../useBackendReachable';
import { createQueryClientWrapper } from '../../../test/queryClientWrapper';

describe('useBackendReachable', () => {
  beforeEach(() => {
    // `shouldAdvanceTime` lets real wall-clock time drive fake timers so
    // @testing-library/react's waitFor (setTimeout-based polling) can resolve
    // while React Query 5 schedules its own internal setTimeouts. Without it,
    // every test hangs because waitFor's polls never fire. We keep fake timers
    // active (rather than dropping them) so refetchInterval tests added later
    // can advance the clock via vi.advanceTimersByTime(15_000).
    vi.useFakeTimers({ shouldAdvanceTime: true });
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
