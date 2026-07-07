import { describe, it, expect, vi, afterEach } from 'vitest';
import { isSafeOutboundUrl, fetchWithGuard } from '../src/security/url-guard.js';

afterEach(() => vi.restoreAllMocks());

describe('isSafeOutboundUrl', () => {
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