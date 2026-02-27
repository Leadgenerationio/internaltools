/**
 * Redis-backed sliding window rate limiter.
 *
 * Uses sorted sets in Redis for a true sliding window (not fixed buckets).
 * Falls back to in-memory Map when Redis is unavailable.
 *
 * Usage in API routes:
 *   const rl = await checkRateLimit(userId || ip, '/api/render');
 *   if (!rl.allowed) return NextResponse.json(..., { status: 429 });
 */

import { getRedis } from '@/lib/redis';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  '/api/generate-ads': { maxRequests: 5, windowMs: 60_000 },
  '/api/generate-video': { maxRequests: 3, windowMs: 60_000 },
  '/api/render': { maxRequests: 50, windowMs: 60_000 },
  '/api/upload': { maxRequests: 20, windowMs: 60_000 },
  '/api/upload-music': { maxRequests: 20, windowMs: 60_000 },
  '/api/log': { maxRequests: 60, windowMs: 60_000 },
  '/api/logs': { maxRequests: 30, windowMs: 60_000 },
  '/api/tickets': { maxRequests: 30, windowMs: 60_000 },
  '/api/admin/tickets': { maxRequests: 30, windowMs: 60_000 },
  '/api/integrations/google-drive/export': { maxRequests: 5, windowMs: 60_000 },
};

interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

// ─── In-memory fallback (same as old middleware) ─────────────────────────────

const memoryStore = new Map<string, { count: number; resetAt: number }>();

// Clean stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  memoryStore.forEach((entry, key) => {
    if (now > entry.resetAt) memoryStore.delete(key);
  });
}, 5 * 60_000);

function checkMemory(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || now > entry.resetAt) {
    memoryStore.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true, retryAfterMs: 0 };
}

// ─── Redis sliding window ────────────────────────────────────────────────────

async function checkRedis(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) return checkMemory(key, config);

  try {
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const redisKey = `rl:${key}`;

    // Atomic: remove old entries, add current, count window, set expiry
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(redisKey, 0, windowStart);
    pipeline.zadd(redisKey, now, `${now}:${Math.random()}`);
    pipeline.zcard(redisKey);
    pipeline.pexpire(redisKey, config.windowMs);

    const results = await pipeline.exec();
    if (!results) return checkMemory(key, config);

    const count = results[2]?.[1] as number;

    if (count > config.maxRequests) {
      // Over limit — find when the oldest entry in window will expire
      const oldest = await redis.zrange(redisKey, 0, 0, 'WITHSCORES');
      const oldestTime = oldest.length >= 2 ? parseInt(oldest[1], 10) : now;
      const retryAfterMs = Math.max(0, oldestTime + config.windowMs - now);
      return { allowed: false, retryAfterMs };
    }

    return { allowed: true, retryAfterMs: 0 };
  } catch (err) {
    console.error('[RateLimit] Redis error, falling back to memory:', err);
    return checkMemory(key, config);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Check rate limit for a given identity and route.
 * Returns immediately for routes not in RATE_LIMITS.
 */
export async function checkRateLimit(
  identity: string,
  pathname: string
): Promise<RateLimitResult> {
  const routeKey = Object.keys(RATE_LIMITS).find((key) => pathname.startsWith(key));
  if (!routeKey) return { allowed: true, retryAfterMs: 0 };

  const config = RATE_LIMITS[routeKey];
  const key = `${identity}:${routeKey}`;

  return checkRedis(key, config);
}

/**
 * Get the client IP from a request (for unauthenticated rate limiting).
 */
export function getClientIp(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || headers.get('x-real-ip')
    || '127.0.0.1';
}
