export async function readJsonOrThrow<T>(r: Response, label = 'resource'): Promise<T> {
  const text = await r.text();
  let body: { error?: unknown } | null = null;
  if (text) {
    try {
      body = JSON.parse(text) as { error?: unknown };
    } catch {
      body = null;
    }
  }

  if (!r.ok) {
    if (r.status === 503 || body?.error === 'backend_unavailable') {
      throw new Error('backend_unavailable');
    }
    if (typeof body?.error === 'string') {
      throw new Error(body.error);
    }
    throw new Error(`Failed to load ${label}: ${r.status}`);
  }

  return body as T;
}
