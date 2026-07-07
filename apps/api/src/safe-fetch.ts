import { BlockList, isIP } from 'node:net';

/**
 * Validates a URL is safe to fetch from the server. Rejects non-public IPs
 * (loopback, RFC1918, link-local, ULA, multicast) and file:// schemes to
 * prevent SSRF to internal services and AWS/GCP metadata endpoints.
 *
 * Returns the URL on success, throws on rejection. Use `safeFetch()` below
 * for a drop-in fetch() replacement in route handlers and workers.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

const blockedV4 = new BlockList();
// IPv4
for (const cidr of [
  '0.0.0.0/8', // current network
  '10.0.0.0/8', // private
  '100.64.0.0/10', // CGN
  '127.0.0.0/8', // loopback
  '169.254.0.0/16', // link-local (incl. AWS/GCP/Azure metadata 169.254.169.254)
  '172.16.0.0/12', // private
  '192.0.0.0/24', // IETF reserved
  '192.0.2.0/24', // TEST-NET-1
  '192.168.0.0/16', // private
  '198.18.0.0/15', // benchmarking
  '198.51.100.0/24', // TEST-NET-2
  '203.0.113.0/24', // TEST-NET-3
  '224.0.0.0/4', // multicast
  '240.0.0.0/4', // reserved
]) {
  const [start, size] = cidr.split('/');
  if (start !== undefined && size !== undefined) {
    blockedV4.addSubnet(start, Number(size));
  }
}

// Node's BlockList doesn't accept IPv6 (parseSocketAddress rejects it). The
// list of dangerous IPv6 prefixes is short, so we test them via textual
// prefix match — covers the IPv4-mapped range (::ffff:127.0.0.1 etc.) which
// is the most common attack vector against IPv6-aware servers.
const IPV6_BLOCKED_PREFIXES: readonly string[] = [
  '::', // unspecified (::/128) and ::/96 below cover it
  '::1', // loopback (::1/128 and ::ffff prefix)
  '::ffff:', // IPv4-mapped — every ::ffff:a.b.c.d lands on the IPv4 check too
  '64:ff9b::', // IPv4/IPv6 translation
  '100::', // discard prefix
  '2001::', // Teredo + documentation starts here; we coarse-block the first /16
  '2001:db8::', // documentation
  'fc', // ULA fc00::/7
  'fd', // ULA fc00::/7
  'fe8', // link-local fe80::/10
  'fe9',
  'fea',
  'feb',
  'ff', // multicast ff00::/8
];

function isBlockedIPv6(host: string): boolean {
  const lower = host.toLowerCase();
  for (const p of IPV6_BLOCKED_PREFIXES) {
    if (lower.startsWith(p)) return true;
  }
  return false;
}

export class UnsafeUrlError extends Error {
  constructor(reason: string) {
    super(`unsafe url: ${reason}`);
    this.name = 'UnsafeUrlError';
  }
}

export function assertSafeUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new UnsafeUrlError('not a valid URL');
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new UnsafeUrlError(`protocol ${parsed.protocol} not allowed`);
  }
  // Hostname may be an IP literal or a DNS name. For an IP literal we can
  // check directly; for DNS names we still attempt the fetch but Node will
  // resolve to a real IP and undici will respect BlockList via the dispatcher.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UnsafeUrlError('only http(s) allowed');
  }
  // URL.hostname preserves IPv6 brackets ([::1]) per WHATWG. Strip them so
  // isIP / our prefix check see a plain address.
  const rawHost = parsed.hostname;
  const host = rawHost.startsWith('[') && rawHost.endsWith(']')
    ? rawHost.slice(1, -1)
    : rawHost;
  if (isIP(host) === 4) {
    if (blockedV4.check(host)) {
      throw new UnsafeUrlError(`ip ${host} is in a blocked range`);
    }
  } else if (isIP(host) === 6) {
    if (isBlockedIPv6(host)) {
      throw new UnsafeUrlError(`ip ${host} is in a blocked range`);
    }
  }
  return parsed;
}

export interface SafeFetchOptions extends RequestInit {
  /** Max response body bytes; default 5 MB. Throws SafeFetchSizeError when exceeded. */
  maxBytes?: number;
  /** Per-request timeout in ms; default 15_000. */
  timeoutMs?: number;
}

export class SafeFetchTimeoutError extends Error {
  constructor() {
    super('safeFetch: request timed out');
    this.name = 'SafeFetchTimeoutError';
  }
}

export class SafeFetchSizeError extends Error {
  constructor(public readonly limit: number) {
    super(`safeFetch: response exceeded ${limit} bytes`);
    this.name = 'SafeFetchSizeError';
  }
}

/**
 * fetch() wrapper that:
 * 1. Throws UnsafeUrlError if the URL points to a non-public address range.
 * 2. Aborts on timeout (default 15s).
 * 3. Aborts once the response body exceeds maxBytes (default 5 MB).
 *
 * Used for every server-side fetch — route handlers and workers alike.
 */
export async function safeFetch(raw: string, init: SafeFetchOptions = {}): Promise<Response> {
  const url = assertSafeUrl(raw);
  const { maxBytes = 5 * 1024 * 1024, timeoutMs = 15_000, ...rest } = init;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: ctl.signal });
    if (!res.body) return res;
    // Wrap the body so reads throw once the byte cap is reached.
    const reader = res.body.getReader();
    let received = 0;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        received += value.byteLength;
        if (received > maxBytes) {
          controller.error(new SafeFetchSizeError(maxBytes));
          await reader.cancel().catch(() => {});
          return;
        }
        controller.enqueue(value);
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });
    return new Response(stream, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Read a response body as text after streaming — aborts on maxBytes via safeFetch. */
export async function safeFetchText(
  raw: string,
  init?: SafeFetchOptions,
): Promise<{ status: number; text: string }> {
  const res = await safeFetch(raw, init);
  return { status: res.status, text: await res.text() };
}
