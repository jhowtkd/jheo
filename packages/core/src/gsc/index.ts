import {
  fetchSearchAnalyticsDay,
  fetchSearchAnalyticsRange,
  formatGscDate,
  parseSnapshotRow,
  SNAPSHOT_DIMENSIONS,
} from './queries.js';
import { createGscClient, type GscClient } from './client.js';
import { inspectUrl } from './inspect.js';
import type {
  GscClientDeps,
  GscSnapshotRow,
  SearchAnalyticsRequest,
  UrlInspectionRequest,
  UrlInspectionResult,
} from './types.js';

export {
  createGscClient,
  type GscClient,
  type GscClientDeps,
  fetchSearchAnalyticsDay,
  fetchSearchAnalyticsRange,
  formatGscDate,
  inspectUrl,
  parseSnapshotRow,
  SNAPSHOT_DIMENSIONS,
  type GscSnapshotRow,
  type SearchAnalyticsRequest,
  type UrlInspectionRequest,
  type UrlInspectionResult,
};

export {
  GSC_SNAPSHOT,
  lookupGscPageMetrics,
  normalizeGscPageUrl,
  type GscPageMetrics,
  type GscSnapshotContext,
} from './snapshot-context.js';
