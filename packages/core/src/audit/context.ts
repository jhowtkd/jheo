import type { Finding } from '../types.js';

/**
 * Helper that builds a fetchText mock returning the supplied raw HTML
 * for the URL the plugin is auditing, and 404 (empty body) for any
 * supporting asset. Plugin tests compose these via makeHarness.
 */
export interface FetchScript {
  match: (url: string) => boolean;
  respond: () => Promise<{ status: number; headers: Record<string, string>; text: string }>;
}

export function makeAuditHarness(opts: { html: string; url: string; fetches?: FetchScript[] }) {
  const calls: string[] = [];
  const log: { rule: string; detail: Record<string, unknown> }[] = [];
  const ctx = {
    url: opts.url,
    html: opts.html,
    async fetchText(url: string) {
      calls.push(url);
      const entry = opts.fetches?.find((f) => f.match(url));
      if (entry) return entry.respond();
      return { status: 404, headers: {}, text: '' };
    },
    log(rule: string, detail: Record<string, unknown>) {
      log.push({ rule, detail });
    },
  };
  return { ctx, calls, log };
}

export function persistFindings(findings: Finding[]) {
  return findings;
}
