import {
  SearchAnalyticsRequestSchema,
  SearchAnalyticsResponseSchema,
  type GscClientDeps,
  type SearchAnalyticsRequest,
  type SearchAnalyticsResponse,
  type UrlInspectionRequest,
  type UrlInspectionResult,
} from './types.js';

const WEBMASTERS_BASE = 'https://www.googleapis.com/webmasters/v3';
const SEARCHCONSOLE_BASE = 'https://searchconsole.googleapis.com/v1';

function sitePath(siteUrl: string): string {
  return encodeURIComponent(siteUrl);
}

async function authorizedFetch(
  deps: GscClientDeps,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const token = await deps.getAccessToken();
  return deps.fetchFn(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  });
}

export function createGscClient(deps: GscClientDeps) {
  return {
    async querySearchAnalytics(input: SearchAnalyticsRequest): Promise<SearchAnalyticsResponse> {
      const req = SearchAnalyticsRequestSchema.parse(input);
      const url = `${WEBMASTERS_BASE}/sites/${sitePath(req.siteUrl)}/searchAnalytics/query`;
      const res = await authorizedFetch(deps, url, {
        method: 'POST',
        body: JSON.stringify({
          startDate: req.startDate,
          endDate: req.endDate,
          dimensions: req.dimensions,
          rowLimit: req.rowLimit,
          startRow: req.startRow,
          dataState: req.dataState,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`gsc searchAnalytics ${res.status}: ${text}`);
      }
      const json: unknown = await res.json();
      return SearchAnalyticsResponseSchema.parse(json);
    },

    async inspectUrl(input: UrlInspectionRequest): Promise<UrlInspectionResult> {
      const url = `${SEARCHCONSOLE_BASE}/urlInspection/index:inspect`;
      const res = await authorizedFetch(deps, url, {
        method: 'POST',
        body: JSON.stringify({
          inspectionUrl: input.inspectionUrl,
          siteUrl: input.siteUrl,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`gsc urlInspection ${res.status}: ${text}`);
      }
      const json = (await res.json()) as { inspectionResult?: UrlInspectionResult };
      return json.inspectionResult ?? { inspectionUrl: input.inspectionUrl };
    },
  };
}

export type GscClient = ReturnType<typeof createGscClient>;
