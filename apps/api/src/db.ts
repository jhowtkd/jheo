import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __jheoPrisma: PrismaClient | undefined;
}

export const prisma = globalThis.__jheoPrisma ?? new PrismaClient();
if (globalThis.__jheoPrisma === undefined) {
  globalThis.__jheoPrisma = prisma;
}