/**
 * Redis client singleton.
 *
 * Lazy-connects on first use from REDIS_URL env var.
 * When REDIS_URL is not set, all operations gracefully degrade —
 * callers should check `isRedisAvailable()` or handle null returns.
 *
 * Railway Redis add-on automatically provides REDIS_URL.
 */

import Redis from 'ioredis';

let client: Redis | null = null;
let noUrl = false; // true when REDIS_URL is not set (permanent for this process)

/**
 * Get the shared Redis client instance (for general cache/pub/sub).
 * Returns null if REDIS_URL is not configured.
 */
export function getRedis(): Redis | null {
  if (noUrl) return null;

  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) {
      noUrl = true;
      console.warn('[Redis] REDIS_URL not set — Redis features disabled, falling back to in-memory');
      return null;
    }

    try {
      client = new Redis(url, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          if (times > 5) {
            console.error('[Redis] Max reconnection attempts reached');
            return null; // Stop retrying
          }
          return Math.min(times * 500, 3000);
        },
        lazyConnect: false,
        enableReadyCheck: true,
        connectTimeout: 5000,
      });

      client.on('error', (err) => {
        console.error('[Redis] Connection error:', err.message);
      });

      client.on('connect', () => {
        console.log('[Redis] Connected');
      });
    } catch (err) {
      console.error('[Redis] Failed to create client:', err);
      client = null;
      return null;
    }
  }

  return client;
}

/**
 * Create a new dedicated Redis connection (for BullMQ queues/workers).
 *
 * BullMQ requires each Queue and Worker to have its own connection
 * with `maxRetriesPerRequest: null`. This factory creates a fresh
 * connection each time it's called.
 *
 * Returns null if REDIS_URL is not configured.
 */
export function createRedisConnection(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  return new Redis(url, {
    maxRetriesPerRequest: null, // Required by BullMQ
    retryStrategy(times) {
      if (times > 10) return null;
      return Math.min(times * 500, 5000);
    },
    lazyConnect: false,
    enableReadyCheck: true,
    connectTimeout: 5000,
  });
}

/**
 * Check if Redis is available and connected.
 */
export function isRedisAvailable(): boolean {
  const r = getRedis();
  return r !== null && r.status === 'ready';
}

/**
 * Gracefully disconnect Redis (for cleanup/shutdown).
 */
export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
