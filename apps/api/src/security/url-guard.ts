import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

type CidrV4 = readonly [string, number];
type CidrV6 = readonly [string, number];

const PRIVATE_V4_CIDRS: ReadonlyArray<CidrV4> = [
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['0.0.0.0', 8],
  ['100.64.0.0', 10],
];
const PRIVATE_V6_CIDRS: ReadonlyArray<CidrV6> = [
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
];

function ipToBigInt(ip: string): bigint {
  if (isIP(ip) === 4) {
    return ip.split('.').reduce((acc, oct) => (acc << 8n) + BigInt(oct), 0n);
  }
  // IPv6 — eight 16-bit groups of hex, separated by `:`. The `::`
  // shorthand encodes one or more implicit zero groups and may appear
  // at the start, end, or middle (e.g. `::1`, `fc00::`, `2606:..10::ac42:..`).
  // Split on `::` so the implicit groups can be filled in correctly,
  // otherwise the resulting BigInt lands at the wrong bit positions and
  // `cidrContainsV6` matches the wrong ranges.
  const doubleColon = ip.indexOf('::');
  const pad = (s: string) => s.padStart(4, '0');
  let groups: string[];
  if (doubleColon === -1) {
    // No compression: exactly 8 explicit groups.
    groups = ip.split(':').map(pad);
  } else {
    const head = ip.slice(0, doubleColon);
    const tail = ip.slice(doubleColon + 2);
    const headParts = head === '' ? [] : head.split(':');
    const tailParts = tail === '' ? [] : tail.split(':');
    if (headParts.length + tailParts.length >= 8) {
      // `::` must encode at least one zero group; if the explicit parts
      // already fill 8 groups the address is malformed. Fall back to the
      // pre-fix behaviour so the call site gets a "deny" instead of a
      // silent misread.
      return 0n;
    }
    const implicit = 8 - (headParts.length + tailParts.length);
    groups = [
      ...headParts.map(pad),
      ...Array(implicit).fill('0000'),
      ...tailParts.map(pad),
    ];
  }
  let acc = 0n;
  for (const g of groups) acc = (acc << 16n) + BigInt(parseInt(g, 16));
  return acc;
}

function cidrContainsV4(cidr: CidrV4, ip: string): boolean {
  if (isIP(ip) !== 4) return false;
  const base = cidr[0];
  const bits = cidr[1];
  if (base === undefined || bits === undefined) return false;
  const mask = bits === 0 ? 0n : (~0n << BigInt(32 - bits)) & 0xffffffffn;
  return (ipToBigInt(ip) & mask) === (ipToBigInt(base) & mask);
}

function cidrContainsV6(cidr: CidrV6, ip: string): boolean {
  if (isIP(ip) !== 6) return false;
  const base = cidr[0];
  const bits = cidr[1];
  if (base === undefined || bits === undefined) return false;
  const mask = bits === 0 ? 0n : (~0n << BigInt(128 - bits)) & ((1n << 128n) - 1n);
  return (ipToBigInt(ip) & mask) === (ipToBigInt(base) & mask);
}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) return PRIVATE_V4_CIDRS.some((c) => cidrContainsV4(c, ip));
  if (isIP(ip) === 6) {
    if (ip.startsWith('::ffff:')) {
      const mapped = ip.slice(7);
      if (isIP(mapped) === 4) return PRIVATE_V4_CIDRS.some((c) => cidrContainsV4(c, mapped));
    }
    return PRIVATE_V6_CIDRS.some((c) => cidrContainsV6(c, ip));
  }
  return true; // unknown => deny
}

/**
 * Strip the brackets that the WHATWG URL parser keeps on `url.hostname`
 * for IPv6 literals (e.g. `http://[::1]/` → `::1`). `isIP` and the CIDR
 * checkers all expect a plain address.
 */
function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

/**
 * SSRF error class — thrown by the sync textual check below. The async
 * `isSafeOutboundUrl` / `fetchWithGuard` throw a plain `Error` for
 * backwards-compat with existing callers, but textual callers (e.g. Zod
 * schemas that can't be async) want a typed class for `instanceof` checks.
 */
export class UnsafeUrlError extends Error {
  constructor(reason: string) {
    super(`unsafe url: ${reason}`);
    this.name = 'UnsafeUrlError';
  }
}

/**
 * Synchronous textual SSRF guard. Same scheme + IP-literal policy as the
 * async version, but does NOT perform DNS resolution — use this only when
 * the calling context is sync (Zod `superRefine`, schema bootstrap) and
 * the URL will be re-checked asynchronously before any network call.
 *
 * For every actual outbound fetch, prefer `fetchWithGuard`, which combines
 * the textual check + DNS resolution + redirect re-check.
 */
export function isSafeOutboundUrlSync(input: string): boolean {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return false;
  }
  if (!ALLOWED_SCHEMES.has(url.protocol)) return false;
  const host = stripBrackets(url.hostname);
  if (host === '') return false;
  if (isIP(host) > 0) return !isPrivateIp(host);
  // Cannot DNS-resolve synchronously. Caller is responsible for ensuring
  // the URL is re-validated before any fetch.
  return true;
}

/**
 * Back-compat alias for the textual check that throws. Mirrors the
 * pre-existing `assertSafeUrl` shape from `safe-fetch.ts` so call sites
 * that did `try { assertSafeUrl(raw) } catch (e instanceof UnsafeUrlError)`
 * continue to work after the consolidation.
 */
export function assertSafeUrl(input: string): URL {
  if (!isSafeOutboundUrlSync(input)) {
    // Distinguish the most common failure modes for the throw message so
    // schema-validation errors stay readable.
    let parsed: URL | null = null;
    try { parsed = new URL(input); } catch { /* not a URL */ }
    if (parsed === null) throw new UnsafeUrlError('not a valid URL');
    if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
      throw new UnsafeUrlError(`protocol ${parsed.protocol} not allowed`);
    }
    throw new UnsafeUrlError(`host ${parsed.hostname} is not safe to fetch`);
  }
  return new URL(input);
}

export async function isSafeOutboundUrl(input: string): Promise<boolean> {
  if (!isSafeOutboundUrlSync(input)) return false;
  const url = new URL(input);
  const host = stripBrackets(url.hostname);
  // Literal IPs were already vetted by the sync check.
  if (isIP(host) > 0) return true;
  // DNS-resolve for the host part. Catches TOCTOU on DNS rebinding that the
  // textual check can't see (a hostname that resolves to a private IP).
  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = await dnsLookup(host, { all: true, verbatim: true });
  } catch {
    return false; // resolution failure => deny
  }
  if (addrs.length === 0) return false;
  return addrs.every((a) => !isPrivateIp(a.address));
}

export async function fetchWithGuard(input: string, init?: RequestInit): Promise<Response> {
  if (!(await isSafeOutboundUrl(input))) {
    throw new Error(`unsafe outbound url: ${input}`);
  }
  // Default timeout when callers omit signal (publish path historically hung forever).
  const signal =
    init?.signal ??
    (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
      ? AbortSignal.timeout(15_000)
      : undefined);
  try {
    const res = await fetch(input, signal ? { ...init, signal } : init);
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (loc) {
        // Resolve relative to input
        const next = new URL(loc, input).toString();
        if (!(await isSafeOutboundUrl(next))) {
          throw new Error(`unsafe redirect target: ${next}`);
        }
      }
    }
    return res;
  } catch (err) {
    if (
      signal?.aborted &&
      err instanceof Error &&
      (err.name === 'AbortError' || err.name === 'TimeoutError')
    ) {
      throw new SafeFetchTimeoutError();
    }
    throw err;
  }
}

export class SafeFetchTimeoutError extends Error {
  constructor() {
    super('fetchWithGuard: request timed out');
    this.name = 'SafeFetchTimeoutError';
  }
}

export class SafeFetchSizeError extends Error {
  constructor(public readonly limit: number) {
    super(`fetchWithGuard: response exceeded ${limit} bytes`);
    this.name = 'SafeFetchSizeError';
  }
}

export interface GuardedFetchOptions extends RequestInit {
  /** Max response body bytes; default 5 MB. Throws SafeFetchSizeError when exceeded. */
  maxBytes?: number;
  /** Per-request timeout in ms; default 15_000. */
  timeoutMs?: number;
}

/**
 * `fetchWithGuard` + size cap + timeout. Throws `UnsafeUrlError` /
 * plain `Error` for SSRF rejection (the route layer maps to 422 / 502);
 * `SafeFetchSizeError` for the body cap; `SafeFetchTimeoutError` for the
 * timeout. Replaces the old `safeFetch` from `apps/api/src/safe-fetch.ts`
 * (deleted in the C-1 consolidation).
 */
export async function guardedFetch(
  input: string,
  init: GuardedFetchOptions = {},
): Promise<Response> {
  const { maxBytes = 5 * 1024 * 1024, timeoutMs = 15_000, ...rest } = init;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchWithGuard(input, { ...rest, signal: ctl.signal });
    if (!res.body) return res;
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