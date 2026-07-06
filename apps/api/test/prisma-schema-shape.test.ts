import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';

describe('prisma schema (F2)', () => {
  it.runIf(Boolean(process.env.DATABASE_URL))('declares Material, Setting, GenerationTemplate, Generation', async () => {
    await prisma.$queryRawUnsafe('SELECT 1');
    await expect(prisma.material.findMany({ take: 0 })).resolves.toBeDefined();
    await expect(prisma.setting.findMany({ take: 0 })).resolves.toBeDefined();
    await expect(prisma.generationTemplate.findMany({ take: 0 })).resolves.toBeDefined();
    await expect(prisma.generation.findMany({ take: 0 })).resolves.toBeDefined();
  });
});