/** Stable cache key for in-flight fetchText deduplication (avoids JSON.stringify on headers). */
export function fetchDedupKey(url: string, init?: RequestInit): string {
  const headers = init?.headers;
  if (!headers) return url;

  const parts: string[] = [];
  if (headers instanceof Headers) {
    headers.forEach((v, k) => parts.push(`${k.toLowerCase()}:${v}`));
  } else if (Array.isArray(headers)) {
    for (const [k, v] of headers) parts.push(`${k.toLowerCase()}:${v}`);
  } else {
    for (const [k, v] of Object.entries(headers)) parts.push(`${k.toLowerCase()}:${String(v)}`);
  }
  parts.sort();
  return parts.length === 0 ? url : `${url}|${parts.join('\0')}`;
}
