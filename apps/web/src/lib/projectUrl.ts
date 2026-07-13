/**
 * Client-side URL helper for project create. Pre-normalizes bare domains to
 * https:// and validates plausibility before sending to the API. The API
 * (routes/projects.ts domainUrl) does the authoritative origin normalization.
 */

export function normalizeProjectUrl(input: string): string {
  const raw = input.trim();
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return new URL(withScheme).toString();
}

export function isValidProjectUrlInput(input: string): boolean {
  const raw = input.trim();
  if (!raw) return false;
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withScheme);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    // Must have a dotted hostname (reject "localhost" edge garbage, keep real domains).
    if (!url.hostname.includes('.')) return false;
    return true;
  } catch {
    return false;
  }
}
