export type GscPageMetrics = {
  impressions: number;
  clicks: number;
  ctr: number;
  topQuery: string | null;
};

/** Page URL → aggregated GSC metrics (injected by audit worker). */
export type GscSnapshotContext = Record<string, GscPageMetrics>;

export const GSC_SNAPSHOT = Symbol.for('jheo.gsc.snapshot');

/** Normalize URLs for matching GSC page dimension to crawled audit URLs. */
export function normalizeGscPageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    return `${parsed.origin}${pathname}`.toLowerCase();
  } catch {
    return url.toLowerCase().replace(/\/$/, '');
  }
}

export function lookupGscPageMetrics(
  ctx: Record<symbol, unknown>,
  pageUrl: string,
): GscPageMetrics | undefined {
  const snapshot = ctx[GSC_SNAPSHOT] as GscSnapshotContext | undefined;
  if (!snapshot) return undefined;
  const key = normalizeGscPageUrl(pageUrl);
  if (snapshot[key]) return snapshot[key];
  const withSlash = `${key}/`;
  const withoutSlash = key.endsWith('/') ? key.slice(0, -1) : key;
  return snapshot[withSlash] ?? snapshot[withoutSlash];
}
