import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import type { PrismaClient } from '@prisma/client';
import type { EmbeddingProvider, LLMProvider } from '@jheo/core';
import { loadEnv } from './env.js';
import { makeAuditHandler, type FetchText } from './jobs/audit-job.js';
import { makeGenerateHandler } from './jobs/generate-job.js';
import { makePublishHandler, type PublishJobData } from './jobs/publish-job.js';
import { makeGscHandler } from './jobs/gsc-job.js';
import {
  AUDIT_LOCK_DURATION_MS,
  AUDIT_ORCHESTRATOR_TIMEOUT_MS,
} from './audit-timeouts.js';

export { AUDIT_LOCK_DURATION_MS, AUDIT_ORCHESTRATOR_TIMEOUT_MS };
const env = loadEnv();

const connection = new IORedis({
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
  connectTimeout: 10_000,
  enableOfflineQueue: false,
});

/**
 * Default job options applied to every job enqueued on a queue, and to every
 * worker that consumes from it. Combine with the worker's own concurrency cap
 * to bound retry storms against external providers.
 */
const RETRY_POLICY = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 15_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600, count: 1000 },
};

const GENERATE_RETRY_POLICY = {
  ...RETRY_POLICY,
  attempts: 5, // generate jobs are the most expensive; tolerate more transient blips
};

/** Read with a numeric fallback for env-driven config knobs. */
function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Limiter cap so a flood of jobs doesn't slam external providers. */
function readLimiter(name: string, fallbackMs: { max: number; ms: number }) {
  const max = readInt(`${name}_MAX`, fallbackMs.max);
  // BullMQ 5's RateLimiterOptions.duration is a number of ms, not a string.
  const ms = readInt(`${name}_MS`, fallbackMs.ms);
  return { max, duration: ms };
}

export const AUDIT_QUEUE = 'audit';

export const auditQueue = new Queue(AUDIT_QUEUE, {
  connection,
  defaultJobOptions: RETRY_POLICY,
});

export type AuditJobData = { auditId: string };

export function startWorkers(fetchText: FetchText) {
  return new Worker<AuditJobData>(
    AUDIT_QUEUE,
    async (job) => makeAuditHandler({ fetchText })(job),
    {
      connection,
      // 27 audit plugins × concurrency N can fan out up to 27×N outbound
      // requests. Keep N low; per-plugin caps in the orchestrator bound it
      // further.
      concurrency: readInt('AUDIT_CONCURRENCY', 2),
      limiter: readLimiter('AUDIT_LIMITER', { max: 60, ms: 60_000 }),
      lockDuration: AUDIT_LOCK_DURATION_MS,
      ...RETRY_POLICY,
    },
  );
}

export const GENERATE_QUEUE = 'generate';
export const generateQueue = new Queue(GENERATE_QUEUE, {
  connection,
  defaultJobOptions: GENERATE_RETRY_POLICY,
});

export type GenerateJobData = { generationId: string };

export function startGenerateWorkers(
  fetchFn: typeof fetch,
  embedProvider: EmbeddingProvider,
  llmProviders: Record<string, LLMProvider>,
  prisma: PrismaClient,
) {
  return new Worker<GenerateJobData>(
    GENERATE_QUEUE,
    async (job) => makeGenerateHandler({ prisma, fetchFn, embedProvider, llmProviders })(job),
    {
      connection,
      concurrency: readInt('GENERATE_CONCURRENCY', 3),
      // External LLM providers' rate limits (OpenAI tier-1: 500 RPM) sit
      // well above what one process will see; this is mostly to keep
      // retries from snowballing.
      limiter: readLimiter('GENERATE_LIMITER', { max: 120, ms: 60_000 }),
      ...GENERATE_RETRY_POLICY,
    },
  );
}

export const PUBLISH_QUEUE = 'publish';
export const publishQueue = new Queue(PUBLISH_QUEUE, {
  connection,
  defaultJobOptions: RETRY_POLICY,
});

export type { PublishJobData };

type PublishHandlerDeps = Parameters<typeof makePublishHandler>[0];

export function startPublishWorkers(deps: PublishHandlerDeps) {
  return new Worker<PublishJobData>(
    PUBLISH_QUEUE,
    async (job) => makePublishHandler(deps)(job),
    {
      connection,
      concurrency: readInt('PUBLISH_CONCURRENCY', 3),
      limiter: readLimiter('PUBLISH_LIMITER', { max: 120, ms: 60_000 }),
      ...RETRY_POLICY,
    },
  );
}

export const GSC_QUEUE = 'gsc';

const GSC_RETRY_POLICY = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 30_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600, count: 1000 },
};

export const gscQueue = new Queue(GSC_QUEUE, {
  connection,
  defaultJobOptions: GSC_RETRY_POLICY,
});

export type GscJobData =
  | { action: 'snapshot'; projectId: string }
  | { action: 'inspect'; projectId: string; inspectionUrl: string; publishId?: string };

type GscHandlerDeps = Parameters<typeof makeGscHandler>[0];

export function startGscWorkers(deps: GscHandlerDeps) {
  return new Worker<GscJobData>(
    GSC_QUEUE,
    async (job) => makeGscHandler(deps)(job),
    {
      connection,
      concurrency: readInt('GSC_CONCURRENCY', 1),
      limiter: readLimiter('GSC_LIMITER', { max: 5, ms: 60_000 }),
      ...GSC_RETRY_POLICY,
    },
  );
}

// Phase 3: per-page audit worker. audit-job.ts fans pages out onto this queue
// so each page runs in its own BullMQ job (cancel + progress + parallelism),
// rather than as an inline loop inside one audit handler (Phase 1/2).
export const AUDIT_PAGE_QUEUE = 'auditPage';

export type PageAuditJobData = {
  // FlowProducer parent group jobs carry only `{ auditId }` and act as a
  // no-op marker for `waitUntilFinished`. Optional so the worker can
  // distinguish them from real page-audit children.
  pageAuditId?: string;
  auditId: string | null;
  projectPageId: string;
  url: string;
};

// Per spec: retry schedule is 0s (immediate), 30s, then 5min. BullMQ only
// routes through the custom backoff function when the job-level `backoff`
// has an unknown type — which is the trigger to look up
// `settings.backoffStrategy` on the queue. Returning 0 from the function
// means "retry right away" (`Job.moveToFailed` only branches into
// moveToDelayed when `delay` is truthy). The built-in exponential/fixed
// strategies can't express "0 then 30s then 5min", so we use this custom
// function form.
const auditPageBackoffStrategy = (attemptsMade: number) => {
  if (attemptsMade <= 1) return 0;
  if (attemptsMade === 2) return 30_000;
  return 5 * 60_000;
};

export const auditPageQueue = new Queue<PageAuditJobData>(AUDIT_PAGE_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    // `type: 'custom'` makes Backoffs.calculate invoke settings.backoffStrategy.
    // `BackoffOptions.type` is typed as 'fixed' | 'exponential' | (string & {}),
    // so 'custom' is structurally permitted.
    backoff: { type: 'custom' },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
  },
  // `settings.backoffStrategy` is read by Job.moveToFailed at runtime
  // (`queue.opts.settings.backoffStrategy`); the public QueueOptions type
  // only declares `settings: AdvancedRepeatOptions`, so cast to attach the
  // function-typed custom retry policy.
  settings: { backoffStrategy: auditPageBackoffStrategy } as never,
});

/** Concurrency cap read by server.ts when creating the Worker. */
export const auditPageConcurrency = readInt('JHEO_AUDIT_PAGE_CONCURRENCY', 5);

/** Orchestrator selection: 'flow' (default, BullMQ flow producer) or 'polling'. */
export const auditOrchestrator = (
  process.env.JHEO_AUDIT_ORCHESTRATOR ?? 'flow'
) as 'flow' | 'polling';
