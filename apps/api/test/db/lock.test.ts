import { describe, it, expect, beforeAll } from 'vitest';
import { prisma, withGenerationLock } from '../../src/db.js';

let canRunDb = false;
beforeAll(async () => {
  try { await prisma.$queryRaw`SELECT 1`; canRunDb = true; } catch { canRunDb = false; }
});

describe.skipIf(!canRunDb)('withGenerationLock', () => {
  it('serialises two concurrent calls for the same generationId', async () => {
    const gen = await prisma.generation.create({
      data: {
        projectId: (await prisma.project.findFirstOrThrow({ select: { id: true } })).id,
        prompt: 'lock test',
        modelOutput: 'unused',
        reviewState: 'approved',
      },
    });
    const order: number[] = [];
    const p1 = withGenerationLock(prisma, gen.id, async () => {
      order.push(1);
      await new Promise((r) => setTimeout(r, 200));
      order.push(2);
      return 1;
    });
    const p2 = withGenerationLock(prisma, gen.id, async () => {
      order.push(3);
      await new Promise((r) => setTimeout(r, 50));
      order.push(4);
      return 2;
    });
    const [a, b] = await Promise.all([p1, p2]);
    expect([a, b]).toEqual([1, 2]);
    expect(order).toEqual([1, 2, 3, 4]); // strict serialization
    await prisma.generation.delete({ where: { id: gen.id } });
  });
});