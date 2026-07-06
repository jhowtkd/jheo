import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import type { PrismaClient } from '@prisma/client';
import type { EmbeddingProvider, LLMProvider } from '@jheo/core';
import { loadEnv } from './env.js';
import { makeAuditHandler, type FetchText } from './jobs/audit-job.js';
import { makeGenerateHandler } from './jobs/generate-job.js';

const env = loadEnv();

const connection = new IORedis({
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
});

export const AUDIT_QUEUE = 'audit';

export const auditQueue = new Queue(AUDIT_QUEUE, { connection });

export type AuditJobData = { auditId: string };

export function startWorkers(fetchText: FetchText) {
  return new Worker<AuditJobData>(
    AUDIT_QUEUE,
    async (job) => makeAuditHandler({ fetchText })(job),
    { connection, concurrency: 2 },
  );
}

export const GENERATE_QUEUE = 'generate';
export const generateQueue = new Queue(GENERATE_QUEUE, { connection });

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
    { connection, concurrency: 3 },
  );
}

export const PUBLISH_QUEUE = 'publish';
export const publishQueue = new Queue(PUBLISH_QUEUE, { connection });

export type PublishJobData = { publishId: string };