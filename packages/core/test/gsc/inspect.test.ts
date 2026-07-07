import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGscClient, inspectUrl } from '../../src/gsc/index.js';

describe('gsc/inspect', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('inspectUrl posts to urlInspection.index:inspect', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          inspectionResult: {
            inspectionUrl: 'https://example.com/page',
            indexStatusResult: { verdict: 'PASS', coverageState: 'Submitted and indexed' },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const client = createGscClient({
      fetchFn: globalThis.fetch,
      getAccessToken: async () => 'token-abc',
    });

    const result = await inspectUrl(client, {
      siteUrl: 'https://example.com/',
      inspectionUrl: 'https://example.com/page',
    });

    expect(result.indexStatusResult?.verdict).toBe('PASS');
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('urlInspection/index:inspect');
    expect(JSON.parse(init.body as string)).toEqual({
      inspectionUrl: 'https://example.com/page',
      siteUrl: 'https://example.com/',
    });
  });
});
