/**
 * Tiny in-process LRU cache with per-entry TTL. Used to bound the cost of
 * repeated findUnique-by-id calls on read-heavy endpoints (templates,
 * projects, channels) without dragging in lru-cache as a dependency.
 *
 * - max: hard cap on entries (oldest evicted first).
 * - ttlMs: per-entry freshness window; entries returned after the window
 *   are treated as misses and re-fetched.
 *
 * `getOrSet` is the only API callers need; on a miss the loader runs, the
 * result is stored, and returned. Errors thrown by the loader don't poison
 * the cache.
 */
export class LruCache<V> {
  private readonly store = new Map<string, { value: V; expiresAt: number }>();
  constructor(
    private readonly max: number,
    private readonly ttlMs: number,
  ) {}

  getOrSet(key: string, loader: () => Promise<V>): Promise<V> {
    const now = Date.now();
    const hit = this.store.get(key);
    if (hit && hit.expiresAt > now) {
      // Move-to-front: O(1) delete + set re-inserts in insertion order.
      this.store.delete(key);
      this.store.set(key, hit);
      return Promise.resolve(hit.value);
    }
    return loader().then((value) => {
      this.store.delete(key);
      this.store.set(key, { value, expiresAt: now + this.ttlMs });
      // Evict oldest if over cap.
      while (this.store.size > this.max) {
        const oldest = this.store.keys().next().value;
        if (oldest === undefined) break;
        this.store.delete(oldest);
      }
      return value;
    });
  }

  /** Drop a single key — used by mutation routes to invalidate reads. */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Drop all entries matching a prefix. */
  invalidatePrefix(prefix: string): void {
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) this.store.delete(k);
    }
  }

  size(): number {
    return this.store.size;
  }
}
