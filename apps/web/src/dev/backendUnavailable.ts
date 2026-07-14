export interface WritableProxyResponse {
  headersSent?: boolean;
  writeHead: (statusCode: number, headers: Record<string, string>) => void;
  end: (body?: string) => void;
}

/** JSON body the SPA maps via humanError(new Error('backend_unavailable')). */
export const BACKEND_UNAVAILABLE_BODY = { error: 'backend_unavailable' as const };

export function sendBackendUnavailable(res: WritableProxyResponse, retryAfterSec = 5): void {
  if (res.headersSent) return;
  res.writeHead(503, {
    'Content-Type': 'application/json',
    'Retry-After': String(retryAfterSec),
  });
  res.end(JSON.stringify(BACKEND_UNAVAILABLE_BODY));
}
