import type { Job } from 'bullmq';
import { aggregateReviewState, type Publisher, type PublishStatus } from '@jheo/core';
import type { PrismaClient } from '@prisma/client';

const BACKOFF_MS: readonly number[] = [0, 30_000, 300_000];
const MAX_ATTEMPTS_DEFAULT = 3;

export type PublishJobData = { publishId: string };

export function makePublishHandler(deps: {
  prisma: PrismaClient;
  fetchFn: typeof fetch;
  publishers: { wordpress: Publisher; http: Publisher; agent: Publisher };
  decrypt: (ciphertext: string, secret: string) => string;
  aggregateState: (publishes: { status: PublishStatus }[]) => string;
  publishQueueAdd?: (data: PublishJobData, opts?: { delay?: number }) => Promise<unknown>;
}) {
  return async function handle(job: Job<PublishJobData>): Promise<void> {
    const { prisma } = deps;
    const publish = await prisma.publish.findUnique({
      where: { id: job.data.publishId },
      include: { generation: true, channel: true },
    });
    if (!publish) return;
    if (publish.status === 'cancelled') return;

    await prisma.publish.update({
      where: { id: publish.id },
      data: { status: 'running', startedAt: new Date(), attempts: { increment: 1 } },
    });

    const secret = process.env.JHEO_SECRET_KEY ?? '';
    if (!secret) {
      await markFailed(prisma, publish.id, 'JHEO_SECRET_KEY missing');
      await recompute(prisma, publish.generationId, deps.aggregateState);
      return;
    }

    let config: unknown;
    try {
      config = JSON.parse(deps.decrypt(publish.channel.configEncrypted, secret));
    } catch (e) {
      await markFailed(prisma, publish.id, `config decrypt/parse failed: ${(e as Error).message}`);
      return;
    }

    const publisher = deps.publishers[publish.channel.type as keyof typeof deps.publishers];
    if (!publisher) {
      await markFailed(prisma, publish.id, `no publisher for type=${publish.channel.type}`);
      return;
    }

    try {
      const fm = publish.generation.outputFrontMatter as { title?: string; slug?: string; tags?: string[]; description?: string };
      const result = await publisher.publish(
        {
          content: {
            frontMatter: {
              title: fm.title ?? '',
              slug: fm.slug ?? '',
              description: fm.description ?? '',
              tags: fm.tags ?? [],
              date: new Date().toISOString().slice(0, 10),
              sources: [],
              targetSites: [],
            },
            body: publish.generation.outputMarkdown ?? '',
          },
          config,
        },
        deps.fetchFn,
      );
      await prisma.publish.update({
        where: { id: publish.id },
        data: {
          status: 'completed',
          finishedAt: new Date(),
          ...(result.externalId !== undefined ? { externalId: result.externalId } : { externalId: null }),
          ...(result.externalUrl !== undefined ? { externalUrl: result.externalUrl } : { externalUrl: null }),
          response: { status: result.raw.status, body: result.raw.body.slice(0, 1024) },
        },
      });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      const retryable = !e.status || e.status >= 500 || e.status === 408 || e.status === 429;
      const attempts = publish.attempts + 1;
      if (retryable && attempts < MAX_ATTEMPTS_DEFAULT) {
        await prisma.publish.update({
          where: { id: publish.id },
          data: { status: 'queued', lastError: e.message ?? String(err) },
        });
        if (deps.publishQueueAdd) {
          await deps.publishQueueAdd(
            { publishId: publish.id },
            { delay: BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)] ?? 0 },
          );
        }
      } else {
        await markFailed(prisma, publish.id, e.message ?? String(err));
      }
    }

    await recompute(prisma, publish.generationId, deps.aggregateState);
  };
}

async function markFailed(prisma: PrismaClient, id: string, lastError: string) {
  await prisma.publish.update({
    where: { id },
    data: { status: 'failed', finishedAt: new Date(), lastError },
  });
}

type RecomputeDeps = { aggregateState: (publishes: { status: PublishStatus }[]) => string };

async function recompute(
  prisma: PrismaClient,
  generationId: string,
  aggregateState: RecomputeDeps['aggregateState'],
): Promise<void> {
  const publishes = await prisma.publish.findMany({
    where: { generationId },
    select: { status: true },
  });
  const typedStatuses = publishes.map((p) => ({ status: p.status as PublishStatus }));
  const next = aggregateState(typedStatuses);
  const gen = await prisma.generation.findUnique({ where: { id: generationId } });
  if (gen && gen.reviewState !== next) {
    await prisma.generation.update({ where: { id: generationId }, data: { reviewState: next as typeof gen.reviewState } });
  }
}
