import type { Job } from 'bullmq';
import { aggregateReviewState, type Publisher, type PublishStatus } from '@jheo/core';
import { type PrismaClient } from '@prisma/client';
import { guardedFetch } from '../security/url-guard.js';
import { withGenerationLock } from '../db.js';

const BACKOFF_MS: readonly number[] = [0, 30_000, 300_000];
const MAX_ATTEMPTS_DEFAULT = 3;

/**
 * Append-only audit row for a Publish status transition (H-11 part 2).
 *
 * Reads the current `status`, inserts a `PublishEvent` row capturing the
 * `fromStatus -> toStatus` tuple (plus an optional human-readable message),
 * then applies the status update. The event write happens BEFORE the status
 * flip so the row records the OLD state — if the status update fails, no
 * event is left behind.
 *
 * This helper is ATOMIC: it opens its own `prisma.$transaction` internally
 * so the read-then-writes are isolated from concurrent transitions on the
 * same `publishId`. Two concurrent callers could otherwise interleave their
 * findUnique + create + update sequences and produce torn audit rows
 * (PublishEvent stamped with a `fromStatus` that no longer matches the
 * observed state, or worse, two events recorded against the same target
 * state).
 *
 * `toStatus` is typed as `PublishStatus` from `@jheo/core` rather than
 * `string`. The Prisma `Publish.status` column is `String` (not a database
 * enum) so the schema stays forward-compat with ad-hoc statuses, but the
 * application boundary uses the strict union — this helper is the single
 * chokepoint for all `Publish.status` writes from the publish pipeline, so
 * the union is enforced at every in-tree call site. A `CHECK` constraint
 * is a future milestone.
 */
export async function recordPublishTransition(
  prisma: PrismaClient,
  publishId: string,
  toStatus: PublishStatus,
  message?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.publish.findUniqueOrThrow({
      where: { id: publishId },
      select: { status: true },
    });
    await tx.publishEvent.create({
      data: {
        publishId,
        fromStatus: current.status,
        toStatus,
        message: message ?? null,
      },
    });
    await tx.publish.update({
      where: { id: publishId },
      data: { status: toStatus },
    });
  });
}

export type PublishJobData = { publishId: string };

export function makePublishHandler(deps: {
  prisma: PrismaClient;
  fetchFn: typeof fetch;
  publishers: { wordpress: Publisher; http: Publisher; agent: Publisher };
  decrypt: (ciphertext: string, secret: string) => string;
  aggregateState: (publishes: { status: PublishStatus }[]) => string;
  publishQueueAdd?: (data: PublishJobData, opts?: { delay?: number }) => Promise<unknown>;
  gscInspectEnqueue?: (input: {
    projectId: string;
    inspectionUrl: string;
    publishId: string;
  }) => Promise<void>;
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
      data: { startedAt: new Date(), attempts: { increment: 1 } },
    });
    await recordPublishTransition(prisma, publish.id, 'running', 'worker picked up job');

    const secret = process.env.JHEO_SECRET_KEY ?? '';
    if (!secret) {
      await markFailed(prisma, publish.id, 'JHEO_SECRET_KEY missing');
      await recomputeGenerationState(prisma, publish.generationId, deps.aggregateState);
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

    // Wrap the worker-injected fetchFn with the SSRF guard so HttpPublisher
    // (and any future publisher that takes a fetchFn) cannot reach
    // loopback / private / link-local targets. Publishers that don't
    // actually call fetchFn (WordPress, Agent) ignore the wrapper.
    // `packages/core/src/distribution/http.ts` keeps its `fetchFn`-
    // injection invariant — wrapping happens at the API/worker boundary,
    // preserving the "core is infra-free" F3 rule.
    const guardedFetchFn: typeof fetch = (input, init) =>
      guardedFetch(
        typeof input === 'string' ? input : input.toString(),
        { ...init, timeoutMs: 15_000 },
      ) as Promise<Response>;

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
        guardedFetchFn,
      );
      await prisma.publish.update({
        where: { id: publish.id },
        data: {
          finishedAt: new Date(),
          ...(result.externalId !== undefined ? { externalId: result.externalId } : { externalId: null }),
          ...(result.externalUrl !== undefined ? { externalUrl: result.externalUrl } : { externalUrl: null }),
          response: { status: result.raw.status, body: result.raw.body.slice(0, 1024) },
        },
      });
      await recordPublishTransition(prisma, publish.id, 'completed', 'publisher succeeded');

      const channelType = publish.channel.type;
      const externalUrl = result.externalUrl;
      if (
        deps.gscInspectEnqueue
        && externalUrl
        && (channelType === 'wordpress' || channelType === 'http')
      ) {
        try {
          await deps.gscInspectEnqueue({
            projectId: publish.generation.projectId,
            inspectionUrl: externalUrl,
            publishId: publish.id,
          });
        } catch (hookErr) {
          await job.log(
            `GSC inspect enqueue failed (non-fatal): ${hookErr instanceof Error ? hookErr.message : String(hookErr)}`,
          );
        }
      }
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      const retryable = !e.status || e.status >= 500 || e.status === 408 || e.status === 429;
      const attempts = publish.attempts + 1;
      if (retryable && attempts < MAX_ATTEMPTS_DEFAULT) {
        await prisma.publish.update({
          where: { id: publish.id },
          data: { lastError: e.message ?? String(err) },
        });
        await recordPublishTransition(prisma, publish.id, 'queued', `retry attempt ${attempts}`);
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

    await recomputeGenerationState(prisma, publish.generationId, deps.aggregateState);
  };
}

async function markFailed(prisma: PrismaClient, id: string, lastError: string) {
  await prisma.publish.update({
    where: { id },
    data: { finishedAt: new Date(), lastError },
  });
  await recordPublishTransition(prisma, id, 'failed', lastError);
}

/**
 * Re-aggregate the per-channel Publish rows for a generation and update the
 * generation's `reviewState` to match. Wrapped in `pg_advisory_xact_lock` so
 * concurrent workers (publish retries, manual recompute API, the after-failure
 * call path) can never interleave their findMany+update sequences and flip the
 * reviewState off a torn aggregation (H-01).
 *
 * `probe` is an optional test-only injection point; it runs inside the same
 * transaction body so the lock test can observe concurrency.
 */
export async function recomputeGenerationState(
  prisma: PrismaClient,
  generationId: string,
  aggregateState: (publishes: { status: PublishStatus }[]) => string = aggregateReviewState,
  probe?: () => Promise<void>,
): Promise<void> {
  await withGenerationLock(prisma, generationId, async (tx) => {
    const publishes = await tx.publish.findMany({
      where: { generationId },
      select: { status: true },
    });
    const typedStatuses = publishes.map((p) => ({ status: p.status as PublishStatus }));
    const next = aggregateState(typedStatuses);
    const gen = await tx.generation.findUnique({ where: { id: generationId } });
    if (gen && gen.reviewState !== next) {
      await tx.generation.update({
        where: { id: generationId },
        data: { reviewState: next as typeof gen.reviewState },
      });
    }
    if (probe) await probe();
  });
}
