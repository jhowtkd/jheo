import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';

describe('prisma schema (F3)', () => {
  it.runIf(Boolean(process.env.DATABASE_URL))('declares Publish', async () => {
    await prisma.$queryRawUnsafe('SELECT 1');
    await expect((prisma as unknown as { publish: { findMany: unknown } }).publish.findMany).toBeDefined();
  });
});
