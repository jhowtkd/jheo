import type { GscClient } from './client.js';
import type { UrlInspectionRequest, UrlInspectionResult } from './types.js';

export async function inspectUrl(
  client: GscClient,
  input: UrlInspectionRequest,
): Promise<UrlInspectionResult> {
  return client.inspectUrl(input);
}
