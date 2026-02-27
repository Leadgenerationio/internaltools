/**
 * BullMQ queue setup.
 *
 * Creates renderQueue and videoGenQueue backed by Redis.
 * Returns null queues when Redis is unavailable — callers must handle
 * this by falling back to synchronous processing.
 */

import { Queue } from 'bullmq';
import { getRedis } from '@/lib/redis';
import type { RenderJobData, VideoGenJobData } from '@/lib/job-types';

let renderQueue: Queue<RenderJobData> | null = null;
let videoGenQueue: Queue<VideoGenJobData> | null = null;

function getConnection() {
  const redis = getRedis();
  if (!redis) return null;
  return redis;
}

/**
 * Get the render queue. Returns null if Redis unavailable.
 */
export function getRenderQueue(): Queue<RenderJobData> | null {
  if (renderQueue) return renderQueue;

  const connection = getConnection();
  if (!connection) return null;

  // Cast: ioredis version mismatch between standalone ioredis and BullMQ's bundled ioredis
  renderQueue = new Queue<RenderJobData>('render', { connection: connection as any });
  return renderQueue;
}

/**
 * Get the video generation queue. Returns null if Redis unavailable.
 */
export function getVideoGenQueue(): Queue<VideoGenJobData> | null {
  if (videoGenQueue) return videoGenQueue;

  const connection = getConnection();
  if (!connection) return null;

  videoGenQueue = new Queue<VideoGenJobData>('video-gen', { connection: connection as any });
  return videoGenQueue;
}

/**
 * Check if background job processing is available.
 */
export function isQueueAvailable(): boolean {
  return getConnection() !== null;
}
