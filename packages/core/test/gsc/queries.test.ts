import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGscClient, fetchSearchAnalyticsDay, parseSnapshotRow } from '../../src/gsc/index.js';

describe('gsc/queries', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('parseSnapshotRow maps API keys to snapshot fields', () => {
    const row = parseSnapshotRow(['date', 'query', 'page', 'device', 'country'], {
      keys: ['2024-01-01', 'shoes', 'https://example.com/', 'DESKTOP', 'usa'],
      clicks: 10,
      impressions: 100,
      ctr: 0.1,
      position: 3.2,
    });
    expect(row).toEqual({
      date: '2024-01-01',
      query: 'shoes',
      page: 'https://example.com/',
      device: 'DESKTOP',
      country: 'usa',
      clicks: 10,
      impressions: 100,
      ctr: 0.1,
      position: 3.2,
    });
  });

  it('fetchSearchAnalyticsDay calls searchAnalytics with bearer token', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          rows: [
            {
              keys: ['2024-01-01', 'shoes', 'https://example.com/', 'DESKTOP', 'usa'],
              clicks: 1,
              impressions: 2,
              ctr: 0.5,
              position: 1,
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const client = createGscClient({
      fetchFn: globalThis.fetch,
      getAccessToken: async () => 'token-123',
    });

    const rows = await fetchSearchAnalyticsDay(client, 'proj1', {
      siteUrl: 'https://example.com/',
      startDate: '2024-01-01',
      endDate: '2024-01-01',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.projectId).toBe('proj1');
    expect(rows[0]?.query).toBe('shoes');

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/searchAnalytics/query');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-123');
    expect(JSON.parse(init.body as string).dataState).toBe('final');
  });
});
