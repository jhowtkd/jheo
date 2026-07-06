import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { loadEnv } from './env.js';

const env = loadEnv();

const connection = new IORedis({
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
});

export const AUDIT_QUEUE = 'audit';

export const auditQueue = new Queue(AUDIT_QUEUE, { connection });

export type AuditJobData = { auditId: string };

export function makeAuditWorker(processor: (job: Job<AuditJobData>) => Promise<void>) {
  return new Worker<AuditJobData>(AUDIT_QUEUE, async (job) => processor(job), {
    connection,
    concurrency: 2,
  });
}