import { Prisma, PrismaClient } from '@prisma/client';
import { Buffer } from 'node:buffer';

declare global {
  // eslint-disable-next-line no-var
  var __jheoPrisma: PrismaClient | undefined;
}

export const prisma = globalThis.__jheoPrisma ?? new PrismaClient();
if (globalThis.__jheoPrisma === undefined) {
  globalThis.__jheoPrisma = prisma;
}

/**
 * True when `e` is a Prisma unique-constraint violation (P2002).
 * Used by `createPublishWithRotation` to detect cuid collisions so the
 * publish id can be regenerated once.
 */
export function isPrismaUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code: unknown }).code === 'P2002'
  );
}

function hashGenerationId(generationId: string): bigint {
  // Take the first 8 bytes of the cuid as a bigint, modulo 2^63 - 1 to fit in a Postgres bigint.
  const buf = Buffer.from(generationId);
  const slice = buf.subarray(0, Math.min(8, buf.length));
  let h = 0n;
  for (const b of slice) h = (h << 8n) | BigInt(b);
  return h & 0x7fffffffffffffffn;
}

export async function withGenerationLock<T>(
  prisma: PrismaClient,
  generationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const key = hashGenerationId(generationId);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key})`;
    return fn(tx);
  });
}