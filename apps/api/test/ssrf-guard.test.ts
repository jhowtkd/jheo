/**
 * Consolidated SSRF-guard tests.
 *
 * Replaces the previous three test files (url-guard.test.ts,
 * safe-fetch.test.ts, safe-fetch-integration.test.ts) after the C-1
 * consolidation that deleted apps/api/src/safe-fetch.ts. The textual,
 * DNS-resolved, and integration layers now all live in
 * apps/api/src/security/url-guard.ts and are tested here.
 */
import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import {
  isSafeOutboundUrl,
  isSafeOutboundUrlSync,
  assertSafeUrl,
  UnsafeUrlError,
  fetchWithGuard,
  guardedFetch,
} from '../src/security/url-guard.js';
import { buildServer } from '../src/server.js';
import { prisma } from '../src/db.js';

afterEach(() => vi.restoreAllMocks());

describe('isSafeOutboundUrlSync (textual check, no DNS)', () => {
  it('accepts http(s) URLs whose host is a DNS name', () => {
    expect(isSafeOutboundUrlSync('https://example.com/path')).toBe(true);
    expect(isSafeOutboundUrlSync('http://example.com')).toBe(true);
  });

  it('rejects non-http(s) protocols', () => {
    expect(isSafeOutboundUrlSync('file:///etc/passwd')).toBe(false);
    expect(isSafeOutboundUrlSync('ftp://example.com')).toBe(false);
    expect(isSafeOutboundUrlSync('gopher://example.com')).toBe(false);
  });

  it('rejects IPv4 loopback / RFC1918 / link-local', () => {
    for (const url of [
      'http://127.0.0.1/',
      'http://10.0.0.1/',
      'http://192.168.1.1/',
      'http://172.16.0.1/',
      'http://169.254.169.254/latest/meta-data/', // AWS metadata
      'http://0.0.0.0/',
    ]) {
      expect(isSafeOutboundUrlSync(url), url).toBe(false);
    }
  });

  it('rejects IPv6 loopback / ULA / link-local', () => {
    for (const url of [
      'http://[::1]/',
      'http://[fc00::1]/',
      'http://[fe80::1]/',
    ]) {
      expect(isSafeOutboundUrlSync(url), url).toBe(false);
    }
  });

  it('rejects malformed URLs', () => {
    expect(isSafeOutboundUrlSync('not a url')).toBe(false);
    expect(isSafeOutboundUrlSync('//example.com')).toBe(false);
  });
});

describe('assertSafeUrl (throwing textual check)', () => {
  it('throws UnsafeUrlError on rejected URLs', () => {
    expect(() => assertSafeUrl('file:///etc/passwd')).toThrow(UnsafeUrlError);
    expect(() => assertSafeUrl('not a url')).toThrow(UnsafeUrlError);
    expect(() => assertSafeUrl('http://127.0.0.1/')).toThrow(UnsafeUrlError);
  });
  it('returns the parsed URL on success', () => {
    const u = assertSafeUrl('https://example.com/p');
    expect(u.protocol).toBe('https:');
    expect(u.hostname).toBe('example.com');
  });
});

describe('isSafeOutboundUrl (async, DNS-resolved)', () => {
  it('blocks 10.0.0.0/8 (private IPv4)', async () => {
    expect(await isSafeOutboundUrl('http://10.0.0.1/x')).toBe(false);
  });
  it('blocks 192.168.0.0/16 (private IPv4)', async () => {
    expect(await isSafeOutboundUrl('http://192.168.1.1/x')).toBe(false);
  });
  it('blocks 172.16.0.0/12 (private IPv4)', async () => {
    expect(await isSafeOutboundUrl('http://172.16.0.1/x')).toBe(false);
  });
  it('blocks 127.0.0.0/8 (loopback)', async () => {
    expect(await isSafeOutboundUrl('http://127.0.0.1:8080/x')).toBe(false);
  });
  it('blocks 169.254.0.0/16 (link-local)', async () => {
    expect(await isSafeOutboundUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
  });
  it('blocks ::1/128 (IPv6 loopback)', async () => {
    expect(await isSafeOutboundUrl('http://[::1]/x')).toBe(false);
  });
  it('blocks fc00::/7 (IPv6 ULA)', async () => {
    expect(await isSafeOutboundUrl('http://[fc00::1]/x')).toBe(false);
  });
  it('blocks non-http(s) schemes', async () => {
    expect(await isSafeOutboundUrl('file:///etc/passwd')).toBe(false);
    expect(await isSafeOutboundUrl('gopher://example.com/_admin')).toBe(false);
    expect(await isSafeOutboundUrl('javascript:alert(1)')).toBe(false);
  });
  it('rejects a malformed URL', async () => {
    expect(await isSafeOutboundUrl('not a url')).toBe(false);
  });
});

describe('fetchWithGuard', () => {
  it('re-checks the target host on a 3xx redirect', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } }),
    );
    await expect(fetchWithGuard('https://example.com/start')).rejects.toThrow(/unsafe/i);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});

describe('guardedFetch (size cap + timeout)', () => {
  it('rejects SSRF targets with a plain Error (back-compat with route mapping)', async () => {
    await expect(guardedFetch('http://127.0.0.1/x')).rejects.toThrow(/unsafe outbound url/i);
  });
});

// DB-gated integration: the route layer maps the URL-guard rejection to the
// spec's 422 unsafe_url contract. Same shape as the old
// safe-fetch-integration.test.ts (now deleted in the C-1 consolidation).
let canRunDb = false;
let app: Awaited<ReturnType<typeof buildServer>> | undefined;
beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    canRunDb = true;
  } catch {
    canRunDb = false;
    return;
  }
  app = await buildServer();
  await app.ready();
});

// `describe.skipIf(c)(name, fn)` is the brief's exact form. Note that
// `describe.skipIf(c, n, fn)` (3-arg direct) silently registers an empty
// suite and exits non-zero in vitest 2.0.5.
describe.skipIf(!canRunDb)('ssrf-guard integration', () => {
  it('Material POST returns 422 unsafe_url on http://127.0.0.1', async () => {
    const r = await app!.inject({
      method: 'POST',
      url: '/api/projects/p1/materials',
      payload: { type: 'url', title: 'bad', source: 'http://127.0.0.1:1/x' },
    });
    expect(r.statusCode).toBe(422);
    expect(JSON.parse(r.body).error?.code).toBe('unsafe_url');
    expect(JSON.parse(r.body).error?.requestId).toBeTruthy();
  });
});

afterAll(async () => {
  if (app) await app.close();
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
});
