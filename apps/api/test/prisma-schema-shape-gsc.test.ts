import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';

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
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
});

describe('prisma schema (GSC)', () => {
  it.runIf(canRunDb)('declares GscConnection', async () => {
    await expect(
      (prisma as unknown as { gscConnection: { findMany: unknown } }).gscConnection.findMany,
    ).toBeDefined();
  });

  it.runIf(canRunDb)('declares GscSnapshot', async () => {
    await expect(
      (prisma as unknown as { gscSnapshot: { findMany: unknown } }).gscSnapshot.findMany,
    ).toBeDefined();
  });
});
