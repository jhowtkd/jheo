import type { GscClient } from './client.js';
import type { GscSnapshotRow, SearchAnalyticsRequest } from './types.js';

export const SNAPSHOT_DIMENSIONS = ['date', 'query', 'page', 'device', 'country'] as const;

export function formatGscDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseSnapshotRow(
  dimensions: readonly string[],
  row: {
    keys?: string[] | undefined;
    clicks?: number | undefined;
    impressions?: number | undefined;
    ctr?: number | undefined;
    position?: number | undefined;
  },
): Omit<GscSnapshotRow, 'projectId'> | null {
  const keys = row.keys ?? [];
  const indexOf = (name: string) => dimensions.indexOf(name);
  const dateIdx = indexOf('date');
  const queryIdx = indexOf('query');
  const pageIdx = indexOf('page');
  const deviceIdx = indexOf('device');
  const countryIdx = indexOf('country');
  if (dateIdx < 0 || queryIdx < 0 || pageIdx < 0 || deviceIdx < 0 || countryIdx < 0) {
    return null;
  }
  const date = keys[dateIdx];
  const query = keys[queryIdx];
  const page = keys[pageIdx];
  const device = keys[deviceIdx];
  const country = keys[countryIdx];
  if (!date || !query || !page || !device || !country) return null;
  return {
    date,
    query,
    page,
    device,
    country,
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  };
}

export async function fetchSearchAnalyticsDay(
  client: GscClient,
  projectId: string,
  params: Omit<SearchAnalyticsRequest, 'startRow' | 'rowLimit'> & { rowLimit?: number },
): Promise<GscSnapshotRow[]> {
  const dimensions = params.dimensions ?? [...SNAPSHOT_DIMENSIONS];
  const rowLimit = params.rowLimit ?? 25_000;
  const rows: GscSnapshotRow[] = [];
  let startRow = 0;

  for (;;) {
    const response = await client.querySearchAnalytics({
      ...params,
      dimensions,
      rowLimit,
      startRow,
    });
    const batch = response.rows ?? [];
    for (const row of batch) {
      const parsed = parseSnapshotRow(dimensions, row);
      if (parsed) rows.push({ projectId, ...parsed });
    }
    if (batch.length < rowLimit) break;
    startRow += batch.length;
  }

  return rows;
}

/** Max concurrent GSC day fetches (quota-friendly). */
export const GSC_DAY_CONCURRENCY = 4;

export async function fetchSearchAnalyticsRange(
  client: GscClient,
  projectId: string,
  params: {
    siteUrl: string;
    startDate: Date;
    endDate: Date;
    dataState?: 'final' | 'all';
    concurrency?: number;
  },
): Promise<GscSnapshotRow[]> {
  const days: string[] = [];
  const cursor = new Date(params.startDate);
  const end = new Date(params.endDate);
  while (cursor <= end) {
    days.push(formatGscDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const concurrency = Math.max(1, params.concurrency ?? GSC_DAY_CONCURRENCY);
  const all: GscSnapshotRow[] = [];
  let next = 0;

  async function worker() {
    while (next < days.length) {
      const i = next++;
      const day = days[i]!;
      const dayRows = await fetchSearchAnalyticsDay(client, projectId, {
        siteUrl: params.siteUrl,
        startDate: day,
        endDate: day,
        dimensions: [...SNAPSHOT_DIMENSIONS],
        dataState: params.dataState ?? 'final',
      });
      for (const row of dayRows) all.push(row);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, days.length) }, () => worker()));
  return all;
}
