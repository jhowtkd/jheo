import { beforeAll, describe, expect, it, vi } from 'vitest';
import { makePublishHandler, recomputeGenerationState } from '../../src/jobs/publish-job.js';
import { aggregateReviewState } from '@jheo/core';
import { prisma } from '../../src/db.js';

const basePublish = {
  id: 'pub1',
  generationId: 'g1',
  channelId: 'c1',
  status: 'queued',
  attempts: 0,
  generation: {
    id: 'g1',
    projectId: 'p1',
    templateId: 't1',
    materialIds: [],
    prompt: 'x',
    status: 'completed',
    llmConfig: { provider: 'openai', model: 'gpt-4o-mini' },
    sources: [],
    outputMarkdown: `---
title: Hello
slug: hello
description: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
tags: [ai]
date: 2026-07-06
sources: []
targetSites: [https://example.com]
---

body body body body body body body body.`,
    outputFrontMatter: { title: 'Hello' },
    reviewState: 'publishing',
    reviewNotes: null,
    usage: null,
    startedAt: null,
    finishedAt: null,
    createdAt: new Date(),
  },
  channel: {
    id: 'c1',
    projectId: 'p1',
    type: 'http',
    name: 'c',
    configEncrypted: 'encrypted-blob',
    configSchema: 'http',
    isActive: true,
    createdAt: new Date(),
  },
};

describe('jobs/publish-job', () => {
  it('runs an http publish to completion and recomputes the generation state to published', async () => {
    const fakePrisma: any = {
      publish: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
      generation: { findUnique: vi.fn(), update: vi.fn() },
    };
    // `recomputeGenerationState` now opens a transaction (advisory-lock body),
    // so the fakes need a minimal `$transaction` that mirrors the body onto a
    // `tx` proxy. Each row accessor falls through to the same `vi.fn` so the
    // pre-existing assertions still observe the calls.
    fakePrisma.$executeRaw = vi.fn().mockResolvedValue(undefined);
    fakePrisma.$transaction = vi.fn(async (body: (tx: unknown) => Promise<unknown>) => {
      const tx: any = {
        $executeRaw: fakePrisma.$executeRaw,
        publish: fakePrisma.publish,
        generation: fakePrisma.generation,
      };
      return body(tx);
    });
    fakePrisma.publish.findUnique.mockResolvedValue({ ...basePublish });
    fakePrisma.publish.update.mockResolvedValue({});
    fakePrisma.publish.findMany.mockResolvedValue([{ status: 'completed' }]);
    fakePrisma.generation.findUnique.mockResolvedValue({ id: 'g1', reviewState: 'publishing' });
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: '99', link: 'https://x/99' }), { status: 200 }),
    );

    const httpPublisher = {
      type: 'http' as const,
      publish: vi.fn(async (req, _ff) => ({
        externalId: '99',
        externalUrl: 'https://x/99',
        raw: { status: 200, headers: {}, body: '{}' },
      })),
    };

    process.env.JHEO_SECRET_KEY = 'test-secret-key-32-bytes-aaaaaaaaaaaa';
    const handler = makePublishHandler({
      prisma: fakePrisma,
      fetchFn: fakeFetch as unknown as typeof fetch,
      publishers: { wordpress: {}, http: httpPublisher, agent: {} } as never,
      decrypt: (ciphertext: string) => ciphertext === 'encrypted-blob' ? JSON.stringify({
        endpointUrl: 'https://x/api',
        method: 'POST' as const,
        headers: { 'content-type': 'application/json' },
      }) : '{}',
      aggregateState: aggregateReviewState,
    });
    await handler({ data: { publishId: 'pub1' } } as never);

    expect(httpPublisher.publish).toHaveBeenCalled();
    const updateCalls = fakePrisma.publish.update.mock.calls;
    expect(updateCalls.some((c: any[]) => c[0]?.data?.status === 'completed')).toBe(true);
  });

  it('marks the publish failed on retryable error when maxAttempts reached', async () => {
    const fakePrisma: any = {
      publish: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
      generation: { findUnique: vi.fn(), update: vi.fn() },
    };
    fakePrisma.$executeRaw = vi.fn().mockResolvedValue(undefined);
    fakePrisma.$transaction = vi.fn(async (body: (tx: unknown) => Promise<unknown>) => {
      const tx: any = {
        $executeRaw: fakePrisma.$executeRaw,
        publish: fakePrisma.publish,
        generation: fakePrisma.generation,
      };
      return body(tx);
    });
    fakePrisma.publish.findUnique.mockResolvedValue({ ...basePublish, attempts: 3 });
    fakePrisma.publish.update.mockResolvedValue({});
    fakePrisma.publish.findMany.mockResolvedValue([{ status: 'failed' }]);
    fakePrisma.generation.findUnique.mockResolvedValue({ id: 'g1', reviewState: 'publishing' });

    const failingPublisher = {
      type: 'http' as const,
      publish: vi.fn(async () => {
        throw Object.assign(new Error('boom 500'), { status: 500 });
      }),
    };
    process.env.JHEO_SECRET_KEY = 'test-secret-key-32-bytes-aaaaaaaaaaaa';
    const requeueAdd = vi.fn().mockResolvedValue(undefined);
    const handler = makePublishHandler({
      prisma: fakePrisma,
      fetchFn: globalThis.fetch,
      publishers: { wordpress: {}, http: failingPublisher, agent: {} } as never,
      decrypt: () => JSON.stringify({ endpointUrl: 'https://x', method: 'POST', headers: {} }),
      aggregateState: aggregateReviewState,
      publishQueueAdd: requeueAdd,
    });
    await handler({ data: { publishId: 'pub1' } } as never);

    const updateCalls = fakePrisma.publish.update.mock.calls;
    const failed = updateCalls.find((c: any[]) => c[0]?.data?.status === 'failed');
    expect(failed).toBeTruthy();
  });
});

// Static source check: apps/api/src/jobs/*.ts must not contain `$queryRawUnsafe`
// (H-02 hardening). `queryRawUnsafe` was the SQL-injection surface in the
// pre-F1 path; allowing it back in workers would re-open that hole. This test
// does NOT need `canRunDb` gating — it operates on the file system, not the DB.
describe('jobs/* raw SQL safety (H-02)', () => {
  it('jobs use Prisma.sql templates, not $queryRawUnsafe (H-02)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.resolve(__dirname, '../../src/jobs');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));
    for (const f of files) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(src).not.toMatch(/queryRawUnsafe/);
    }
  });
});

// DB-gated integration test: withGenerationLock must serialise concurrent
// recompute calls for the same generationId so the aggregate `reviewState`
// update can't race itself (H-01).
let canRunDb = false;
beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    canRunDb = true;
  } catch {
    canRunDb = false;
  }
});

describe.skipIf(!canRunDb)('publish-job advisory lock', () => {
  it('serialises concurrent recomputeGenerationState calls for the same generationId (H-01)', async () => {
    const owner = await prisma.project.findFirstOrThrow({ select: { id: true } });
    const gen = await prisma.generation.create({
      data: {
        projectId: owner.id,
        prompt: 'lock',
        modelOutput: 'unused',
        reviewState: 'approved',
      },
    });
    // A probe that runs INSIDE the locked body (between the `findMany` and the
    // `update`). We pass it in via the third argument so we can observe whether
    // the advisory lock actually serialises callers. Without the lock,
    // concurrent `Promise.all` callers would interleave and `depth.max > 1`.
    const depth = { current: 0, max: 0 };
    const probe = async () => {
      depth.current += 1;
      depth.max = Math.max(depth.max, depth.current);
      await new Promise((r) => setTimeout(r, 50));
      depth.current -= 1;
    };
    await Promise.all(
      Array.from({ length: 5 }, () =>
        recomputeGenerationState(prisma, gen.id, aggregateReviewState, probe),
      ),
    );
    expect(depth.max).toBe(1);
    await prisma.generation.delete({ where: { id: gen.id } });
  });
});
