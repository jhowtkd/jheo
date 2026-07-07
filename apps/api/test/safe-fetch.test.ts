import { describe, expect, it } from 'vitest';
import { assertSafeUrl, UnsafeUrlError } from '../src/safe-fetch.js';

describe('assertSafeUrl — Phase 1 SSRF guard', () => {
  it('accepts http(s) URLs whose host is a DNS name', () => {
    expect(() => assertSafeUrl('https://example.com/path')).not.toThrow();
    expect(() => assertSafeUrl('http://example.com')).not.toThrow();
  });

  it('rejects non-http(s) protocols', () => {
    expect(() => assertSafeUrl('file:///etc/passwd')).toThrow(UnsafeUrlError);
    expect(() => assertSafeUrl('ftp://example.com')).toThrow(UnsafeUrlError);
    expect(() => assertSafeUrl('gopher://example.com')).toThrow(UnsafeUrlError);
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
      expect(() => assertSafeUrl(url), url).toThrow(UnsafeUrlError);
    }
  });

  it('rejects IPv6 loopback / ULA / link-local', () => {
    for (const url of [
      'http://[::1]/',
      'http://[fc00::1]/',
      'http://[fe80::1]/',
    ]) {
      expect(() => assertSafeUrl(url), url).toThrow(UnsafeUrlError);
    }
  });

  it('rejects malformed URLs', () => {
    expect(() => assertSafeUrl('not a url')).toThrow(UnsafeUrlError);
    expect(() => assertSafeUrl('//example.com')).toThrow(UnsafeUrlError);
  });
});
