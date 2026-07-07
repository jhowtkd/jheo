import { z } from 'zod';

export const GscDeviceSchema = z.enum(['DESKTOP', 'MOBILE', 'TABLET']);
export type GscDevice = z.infer<typeof GscDeviceSchema>;

export const SearchAnalyticsDimensionsSchema = z.array(
  z.enum(['date', 'query', 'page', 'device', 'country']),
);

export const SearchAnalyticsRequestSchema = z.object({
  siteUrl: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dimensions: SearchAnalyticsDimensionsSchema.default([
    'date',
    'query',
    'page',
    'device',
    'country',
  ]),
  rowLimit: z.number().int().min(1).max(25_000).default(25_000),
  startRow: z.number().int().min(0).default(0),
  dataState: z.enum(['final', 'all']).default('final'),
});

export type SearchAnalyticsRequest = z.infer<typeof SearchAnalyticsRequestSchema>;

export const SearchAnalyticsRowSchema = z.object({
  keys: z.array(z.string()).optional(),
  clicks: z.number().optional(),
  impressions: z.number().optional(),
  ctr: z.number().optional(),
  position: z.number().optional(),
});

export const SearchAnalyticsResponseSchema = z.object({
  rows: z.array(SearchAnalyticsRowSchema).optional(),
  responseAggregationType: z.string().optional(),
});

export type SearchAnalyticsResponse = z.infer<typeof SearchAnalyticsResponseSchema>;

export type GscSnapshotRow = {
  projectId: string;
  date: string;
  query: string;
  page: string;
  device: string;
  country: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type UrlInspectionRequest = {
  siteUrl: string;
  inspectionUrl: string;
};

export type UrlInspectionResult = {
  inspectionUrl: string;
  indexStatusResult?: {
    verdict?: string;
    coverageState?: string;
    robotsTxtState?: string;
    indexingState?: string;
    lastCrawlTime?: string;
    pageFetchState?: string;
  };
};

export type GscClientDeps = {
  fetchFn: typeof fetch;
  getAccessToken: () => Promise<string>;
};
