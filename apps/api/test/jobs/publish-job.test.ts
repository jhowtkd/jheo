import { describe, expect, it, vi } from 'vitest';
import { makePublishHandler } from '../../src/jobs/publish-job.js';
import { aggregateReviewState } from '@jheo/core';

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
