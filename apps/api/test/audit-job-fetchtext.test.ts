import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the db module so we don't depend on a live prisma client.
vi.mock('../src/db.js', () => {
  const auditFindUnique = vi.fn();
  const auditUpdate = vi.fn();
  const projectFindUnique = vi.fn();
  const findingCreate = vi.fn();
  const transaction = vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
  return {
    prisma: {
      audit: { findUnique: auditFindUnique, update: auditUpdate },
      project: { findUnique: projectFindUnique },
      projectPage: { createMany: vi.fn(), updateMany: vi.fn() },
      finding: { create: findingCreate, createMany: vi.fn() },
      $transaction: transaction,
    },
  };
});

// Mock @jheo/core so we control what runAudit does and exercise the
// fetchText propagation path deterministically.
vi.mock('@jheo/core', () => {
  return {
    runAudit: vi.fn(async (ctx: {
      url: string;
      html: string;
      fetchText: (
        url: string,
        init?: { headers?: Record<string, string> },
      ) => Promise<unknown>;
    }) => {
      // Mimic what checkMarkdownParallel does: call fetchText with headers.
      await ctx.fetchText(ctx.url, { headers: { Accept: 'text/markdown' } });
      return { findings: [], score: { overall: 100 } };
    }),
  };
});

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

describe('audit-job fetchText propagation', () => {
  it('forwards init.headers from the plugin ctx.fetchText through to the underlying fetch', async () => {
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
    (prisma.finding.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.$transaction as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    // Capture every fetch() invocation: the inner markdown-parallel call must
    // arrive here with merged headers (User-Agent + injected Accept).
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) => {
      return new Response('<html></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    // The api-level fetchText — this is the function we are testing the
    // signature of. It must read init?.headers and merge with default UA.
    const fetchText = async (
      url: string,
      init?: { headers?: Record<string, string> },
    ) => {
      const headers = {
        'User-Agent': 'JHEO/0.1 (+local)',
        ...(init?.headers ?? {}),
      };
      const res = await fetch(url, { headers });
      return {
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        text: await res.text(),
      };
    };

    const handler = makeAuditHandler({ fetchText });
    await handler({ data: { auditId: 'a1' } } as never);

    expect(fetchSpy).toHaveBeenCalled();
    // At least one of the fetch() calls must have received the markdown Accept
    // header (this is what runAudit plugins like checkMarkdownParallel do).
    const withAccept = fetchSpy.mock.calls.find(
      (call) =>
        (call[1]?.headers as Record<string, string> | undefined)?.Accept === 'text/markdown',
    );
    expect(withAccept).toBeDefined();
    const headers = withAccept?.[1]?.headers as Record<string, string>;
    // Default User-Agent must still be present alongside the injected header.
    expect(headers['User-Agent']).toBe('JHEO/0.1 (+local)');
    expect(headers.Accept).toBe('text/markdown');
  });
});
