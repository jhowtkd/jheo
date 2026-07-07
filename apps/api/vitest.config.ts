import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    // Bound parallel workers to avoid OOM on heavy fixtures (Prisma
    // connection pool, jsdom-loaded test mocks, etc.). Both min/max must be
    // present in this version of tinypool.
    pool: 'threads',
    poolOptions: { threads: { minThreads: 1, maxThreads: 4 } },
  },
});
