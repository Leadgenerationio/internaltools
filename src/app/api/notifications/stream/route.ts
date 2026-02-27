/**
 * GET /api/notifications/stream
 *
 * Server-Sent Events endpoint for real-time notification push.
 * Uses Redis pub/sub to receive notification events per user.
 * Falls back gracefully — if Redis unavailable, sends a "fallback" event
 * so the client knows to use polling instead.
 */

import { NextRequest } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { getRedis } from '@/lib/redis';
import Redis from 'ioredis';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max connection

const CHANNEL_PREFIX = 'notifications:';
const HEARTBEAT_INTERVAL = 30_000; // 30s keep-alive

export async function GET(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { userId } = authResult.auth;

  const redis = getRedis();

  // If no Redis, tell client to fall back to polling
  if (!redis) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`event: fallback\ndata: {}\n\n`));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  }

  // Create a dedicated subscriber connection (pub/sub requires its own connection)
  const subRedis = new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    connectTimeout: 5000,
  });

  const channel = `${CHANNEL_PREFIX}${userId}`;
  const encoder = new TextEncoder();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      let connectionTimer: ReturnType<typeof setTimeout> | null = null;

      function cleanup() {
        if (closed) return;
        closed = true;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (connectionTimer) clearTimeout(connectionTimer);
        subRedis.unsubscribe(channel).catch(() => {});
        subRedis.quit().catch(() => {});
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }

      // Register abort listener FIRST to catch early disconnects during connect/subscribe
      request.signal.addEventListener('abort', () => cleanup());

      // Auto-close before maxDuration (4.5 min < 5 min maxDuration) for clean reconnect
      connectionTimer = setTimeout(() => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(`event: reconnect\ndata: {}\n\n`));
          } catch { /* ignore */ }
          cleanup();
        }
      }, 270_000); // 4.5 minutes

      try {
        await subRedis.connect();
      } catch {
        controller.enqueue(encoder.encode(`event: fallback\ndata: {}\n\n`));
        controller.close();
        return;
      }

      // Send initial connected event
      controller.enqueue(encoder.encode(`event: connected\ndata: {}\n\n`));

      // Listen for notification events
      subRedis.on('message', (_ch: string, message: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: notification\ndata: ${message}\n\n`));
        } catch {
          cleanup();
        }
      });

      await subRedis.subscribe(channel);

      // Heartbeat to keep connection alive
      heartbeatTimer = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`:heartbeat\n\n`));
        } catch {
          cleanup();
        }
      }, HEARTBEAT_INTERVAL);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
