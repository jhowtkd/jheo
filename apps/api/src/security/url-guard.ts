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
  // IPv6
  const parts = ip.split(':');
  const full: string[] = [];
  for (const p of parts) {
    if (p === '') continue;
    full.push(p.padStart(4, '0'));
  }
  let acc = 0n;
  for (const p of full) acc = (acc << 16n) + BigInt(parseInt(p, 16));
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

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

export async function isSafeOutboundUrl(input: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return false;
  }
  if (!ALLOWED_SCHEMES.has(url.protocol)) return false;
  const host = url.hostname;
  if (host === '') return false;
  // Literal IP?
  if (isIP(host) > 0) return !isPrivateIp(host);
  // DNS-resolve
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
  const res = await fetch(input, init);
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
}