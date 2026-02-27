/**
 * Redis-backed TTL cache for hot-path data.
 *
 * Reduces DB load for frequently-read data:
 * - Company plan/balance (10s TTL) — checked on every billable operation
 * - Notification unread count (15s TTL) — polled every 30s by all users
 *
 * Falls back gracefully to direct DB queries when Redis is unavailable.
 * All functions are safe to call without Redis — they just bypass the cache.
 */

import { getRedis } from '@/lib/redis';

const CACHE_PREFIX = 'cache:';

// ─── Generic cache helpers ───────────────────────────────────────────────────

/**
 * Get a cached value. Returns null on miss or Redis unavailable.
 */
async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const raw = await redis.get(`${CACHE_PREFIX}${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Set a cached value with TTL in seconds.
 */
async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.setex(`${CACHE_PREFIX}${key}`, ttlSeconds, JSON.stringify(value));
  } catch {
    // Silently fail — cache miss is fine
  }
}

/**
 * Delete a cached key (invalidation).
 */
async function cacheDel(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.del(`${CACHE_PREFIX}${key}`);
  } catch {
    // Silently fail
  }
}

// ─── Company plan/balance cache (10s TTL) ────────────────────────────────────

interface CompanyInfo {
  tokenBalance: number;
  plan: string;
  monthlyTokenBudget: number | null;
}

const COMPANY_TTL = 10; // seconds

/**
 * Get cached company info (plan, balance, budget).
 * Returns null on miss — caller should fetch from DB and call setCompanyInfo.
 */
export async function getCachedCompanyInfo(companyId: string): Promise<CompanyInfo | null> {
  return cacheGet<CompanyInfo>(`company:${companyId}`);
}

/**
 * Cache company info after a DB fetch.
 */
export async function setCachedCompanyInfo(companyId: string, info: CompanyInfo): Promise<void> {
  await cacheSet(`company:${companyId}`, info, COMPANY_TTL);
}

/**
 * Invalidate company cache (call after token deduct/credit/plan change).
 */
export async function invalidateCompanyCache(companyId: string): Promise<void> {
  await cacheDel(`company:${companyId}`);
}

// ─── Notification unread count cache (15s TTL) ──────────────────────────────

const NOTIFICATION_TTL = 15; // seconds

/**
 * Get cached unread notification count.
 * Returns null on miss — caller should fetch from DB.
 */
export async function getCachedUnreadCount(userId: string): Promise<number | null> {
  return cacheGet<number>(`unread:${userId}`);
}

/**
 * Cache unread notification count.
 */
export async function setCachedUnreadCount(userId: string, count: number): Promise<void> {
  await cacheSet(`unread:${userId}`, count, NOTIFICATION_TTL);
}

/**
 * Invalidate notification count cache (call after creating/reading notifications).
 */
export async function invalidateUnreadCount(userId: string): Promise<void> {
  await cacheDel(`unread:${userId}`);
}
