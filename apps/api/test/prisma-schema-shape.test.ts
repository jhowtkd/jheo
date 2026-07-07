import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';

// setup.ts always sets a default DATABASE_URL when one isn't provided, so
// `it.runIf(Boolean(process.env.DATABASE_URL))` is always true. We need an
// actual reachable Postgres to run this test — probe the connection first
// so a missing DB cleanly skips instead of failing the suite.
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
  // Disconnect so vitest can exit cleanly even when the suite is skipped.
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
});

describe('prisma schema (F2)', () => {
  it.runIf(canRunDb)('declares Material, Setting, GenerationTemplate, Generation', async () => {
    await prisma.$queryRawUnsafe('SELECT 1');
    await expect(prisma.material.findMany({ take: 0 })).resolves.toBeDefined();
    await expect(prisma.setting.findMany({ take: 0 })).resolves.toBeDefined();
    await expect(prisma.generationTemplate.findMany({ take: 0 })).resolves.toBeDefined();
    await expect(prisma.generation.findMany({ take: 0 })).resolves.toBeDefined();
  });
});
