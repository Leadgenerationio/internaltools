import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const globalForPrisma = globalThis as unknown as { prisma: any };

function createPrismaClient(): any {
  // Configurable pool size — default 20 connections per instance
  const poolSize = parseInt(process.env.DB_POOL_SIZE || '20', 10);

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: poolSize,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30_000,
  });

  pool.on('error', (err) => {
    console.error('[Prisma/pg] Pool error:', err.message);
  });

  // PrismaPg accepts pg.Pool directly as the first argument
  const adapter = new PrismaPg(pool);
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
