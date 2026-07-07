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
    outputMarkdown: 'body',
    outputFrontMatter: { title: 'Hello' },
  },
  channel: {
    id: 'c1',
    projectId: 'p1',
    type: 'http',
    configEncrypted: 'encrypted-blob',
  },
};

function makeFakePrisma() {
  const fakePrisma: any = {
    publish: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    publishEvent: { create: vi.fn().mockResolvedValue({}) },
    generation: { findUnique: vi.fn(), update: vi.fn() },
  };
  fakePrisma.$executeRaw = vi.fn().mockResolvedValue(undefined);
  fakePrisma.$transaction = vi.fn(async (body: (tx: unknown) => Promise<unknown>) => {
    const tx: any = {
      $executeRaw: fakePrisma.$executeRaw,
      publish: fakePrisma.publish,
      publishEvent: fakePrisma.publishEvent,
      generation: fakePrisma.generation,
    };
    return body(tx);
  });
  return fakePrisma;
}

describe('publish-job GSC inspect hook', () => {
  it('enqueues GSC inspect for http publishes with externalUrl', async () => {
    const fakePrisma = makeFakePrisma();
    fakePrisma.publish.findUnique.mockResolvedValue({ ...basePublish });
    fakePrisma.publish.findUniqueOrThrow.mockResolvedValue({ status: 'running' });
    fakePrisma.publish.update.mockResolvedValue({});
    fakePrisma.publish.findMany.mockResolvedValue([{ status: 'completed' }]);
    fakePrisma.generation.findUnique.mockResolvedValue({ id: 'g1', reviewState: 'publishing' });

    const gscInspectEnqueue = vi.fn().mockResolvedValue(undefined);
    const httpPublisher = {
      type: 'http' as const,
      publish: vi.fn(async () => ({
        externalId: '99',
        externalUrl: 'https://example.com/post',
        raw: { status: 200, headers: {}, body: '{}' },
      })),
    };

    process.env.JHEO_SECRET_KEY = 'test-secret-key-32-bytes-aaaaaaaaaaaa';
    const handler = makePublishHandler({
      prisma: fakePrisma,
      fetchFn: globalThis.fetch,
      publishers: { wordpress: {}, http: httpPublisher, agent: {} } as never,
      decrypt: () => JSON.stringify({
        endpointUrl: 'https://x/api',
        method: 'POST',
        headers: {},
      }),
      aggregateState: aggregateReviewState,
      gscInspectEnqueue,
    });

    await handler({ data: { publishId: 'pub1' }, log: vi.fn() } as never);

    expect(gscInspectEnqueue).toHaveBeenCalledWith({
      projectId: 'p1',
      inspectionUrl: 'https://example.com/post',
      publishId: 'pub1',
    });
  });

  it('does not enqueue GSC inspect for agent channel publishes', async () => {
    const fakePrisma = makeFakePrisma();
    fakePrisma.publish.findUnique.mockResolvedValue({
      ...basePublish,
      channel: { ...basePublish.channel, type: 'agent' },
    });
    fakePrisma.publish.findUniqueOrThrow.mockResolvedValue({ status: 'running' });
    fakePrisma.publish.update.mockResolvedValue({});
    fakePrisma.publish.findMany.mockResolvedValue([{ status: 'completed' }]);
    fakePrisma.generation.findUnique.mockResolvedValue({ id: 'g1', reviewState: 'publishing' });

    const gscInspectEnqueue = vi.fn().mockResolvedValue(undefined);
    const agentPublisher = {
      type: 'agent' as const,
      publish: vi.fn(async () => ({
        externalUrl: 'https://example.com/agent-post',
        raw: { status: 200, headers: {}, body: '{}' },
      })),
    };

    process.env.JHEO_SECRET_KEY = 'test-secret-key-32-bytes-aaaaaaaaaaaa';
    const handler = makePublishHandler({
      prisma: fakePrisma,
      fetchFn: globalThis.fetch,
      publishers: { wordpress: {}, http: {}, agent: agentPublisher } as never,
      decrypt: () => JSON.stringify({}),
      aggregateState: aggregateReviewState,
      gscInspectEnqueue,
    });

    await handler({ data: { publishId: 'pub1' }, log: vi.fn() } as never);

    expect(gscInspectEnqueue).not.toHaveBeenCalled();
  });
});
