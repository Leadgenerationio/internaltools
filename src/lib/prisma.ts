import { PrismaClient } from '@/generated/prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: any };

function createPrismaClient(): any {
  return new (PrismaClient as any)();
}

// Lazy initialization — only connect when first accessed
export const prisma: any = new Proxy({} as any, {
  get(_target, prop) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createPrismaClient();
    }
    return globalForPrisma.prisma[prop];
  },
});
