import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db.js', () => {
  const transaction = vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
  return {
    prisma: {
      audit: { findUnique: vi.fn(), update: vi.fn() },
      project: { findUnique: vi.fn() },
      finding: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      $transaction: transaction,
    },
  };
});

// Run two plugins that both call fetchText on /robots.txt to confirm the
// in-flight cache collapses the calls into a single upstream request, and
// that the plainTextWords / jsonLdBlocks helpers are populated exactly once.
vi.mock('@jheo/core', () => {
  return {
    runAudit: vi.fn(async (ctx: {
      fetchText: (u: string, i?: { headers?: Record<string, string> }) => Promise<unknown>;
    }) => {
      await ctx.fetchText('https://example.com/robots.txt');
      await ctx.fetchText('https://example.com/robots.txt');
      await ctx.fetchText('https://example.com/llms.txt', { headers: { Accept: 'text/plain' } });
      return { findings: [], score: { overall: 100 } };
    }),
  };
});

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

describe('audit-job inflight dedupe', () => {
  it('collapses identical fetchText calls into a single upstream request', async () => {
    const { prisma } = await import('../src/db.js');
    const { makeAuditHandler } = await import('../src/jobs/audit-job.js');

    (prisma.audit.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'a1',
      projectId: 'p1',
      status: 'queued',
    });
    (prisma.project.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p1',
      rootUrl: 'https://example.com/',
    });
    (prisma.audit.update as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});

    // The api-level fetchText: just delegate to globalThis.fetch so we can
    // count how many actual upstream requests leave the process.
    let counter = 0;
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) => {
      counter++;
      return new Response('<html></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const fetchText = async (
      url: string,
      init?: { headers?: Record<string, string>; signal?: AbortSignal },
    ) => {
      const headers = { 'User-Agent': 'JHEO/0.1 (+local)', ...(init?.headers ?? {}) };
      const res = await fetch(url, { headers, signal: init?.signal });
      return {
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        text: await res.text(),
      };
    };

    const handler = makeAuditHandler({ fetchText });
    await handler({ data: { auditId: 'a1' } } as never);

    // count = 1 root HTML fetch + 1 robots.txt (deduped) + 1 llms.txt.
    // If dedupe were missing we'd see 1 + 2 + 1 = 4 upstream calls.
    expect(counter).toBe(3);
    expect(fetchSpy.mock.calls.length).toBe(3);
    const robotsCalls = fetchSpy.mock.calls.filter((c) => (c[0] as string).endsWith('/robots.txt'));
    expect(robotsCalls.length).toBe(1);
  });
});
