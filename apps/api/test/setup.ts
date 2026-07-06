import { beforeAll, afterAll } from 'vitest';
import { loadEnv } from '../src/env.js';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@127.0.0.1:5432/jheo_test';
  process.env.LOG_LEVEL ??= 'silent';
  loadEnv();
});

afterAll(async () => {
  // teardown hooks for prisma / redis / queues will be added in Task 11
});