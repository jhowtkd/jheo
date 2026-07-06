import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';

// setup.ts forces DATABASE_URL, so `it.runIf(Boolean(process.env.DATABASE_URL))`
// would let this run and fail with Postgres auth. Probe the connection first.
let canRunDb = false;

beforeAll(async () => {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    canRunDb = true;
  } catch {
    canRunDb = false;
  }
});

afterAll(async () => {
  // Disconnect prisma so vitest can exit cleanly even when the test was skipped.
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
});

describe('prisma schema (F3)', () => {
  it.runIf(canRunDb)('declares Publish', async () => {
    await expect((prisma as unknown as { publish: { findMany: unknown } }).publish.findMany).toBeDefined();
  });
});
