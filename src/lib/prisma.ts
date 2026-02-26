import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as { prisma: any };

function createPrismaClient(): any {
  // Prisma 7 with prisma-client generator requires a driver adapter
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new (PrismaClient as any)({ adapter });
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
