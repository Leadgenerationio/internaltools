import { PrismaClient } from '@/generated/prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: any };

function createPrismaClient(): any {
  // Prisma 7: datasource URL must be passed explicitly to the client
  // (prisma.config.ts is only for CLI tools like migrate/generate)
  return new (PrismaClient as any)({
    datasourceUrl: process.env.DATABASE_URL,
  });
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
