import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { loadEnv } from './env.js';
import { makeAuditHandler, type FetchText } from './jobs/audit-job.js';

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
