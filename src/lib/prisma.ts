import { PrismaClient } from '@/generated/prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: any };

function createPrismaClient(): any {
  // PrismaClient reads DATABASE_URL from the environment automatically
  return new (PrismaClient as any)();
}

// Lazy initialization — only connect when first accessed
// Bind methods to the real client to preserve `this` context
export const prisma: any = new Proxy({} as any, {
  get(_target, prop) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createPrismaClient();
    }
    const value = globalForPrisma.prisma[prop];
    if (typeof value === 'function') {
      return value.bind(globalForPrisma.prisma);
    }
    return value;
  },
});
