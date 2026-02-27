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
let connectionFailed = false;

/**
 * Get the shared Redis client instance.
 * Returns null if REDIS_URL is not configured or connection failed.
 */
export function getRedis(): Redis | null {
  if (connectionFailed) return null;

  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) {
      connectionFailed = true;
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
          return Math.min(times * 500, 3000); // 500ms, 1s, 1.5s, 2s, 2.5s
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
      connectionFailed = true;
      return null;
    }
  }

  return client;
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
