/**
 * Email queue — routes emails through BullMQ for reliable delivery.
 *
 * When Redis/BullMQ is available, emails are enqueued with 3 retries
 * and exponential backoff. When unavailable, falls back to direct send.
 *
 * Usage: Import `enqueueEmail` instead of calling email functions directly
 * from routes where reliability matters (e.g. webhook handlers, workers).
 */

import { Queue } from 'bullmq';
import { createRedisConnection } from '@/lib/redis';

export interface EmailJobData {
  /** The email function name from src/lib/email.ts */
  template: string;
  /** Arguments to pass to the email function */
  args: unknown[];
}

let emailQueue: Queue<EmailJobData> | null = null;

/**
 * Get the email queue. Returns null if Redis unavailable.
 * Uses a dedicated Redis connection (BullMQ requirement).
 */
export function getEmailQueue(): Queue<EmailJobData> | null {
  if (emailQueue) return emailQueue;

  const connection = createRedisConnection();
  if (!connection) return null;

  emailQueue = new Queue<EmailJobData>('email', {
    connection: connection as any,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // 5s, 10s, 20s
      },
      removeOnComplete: { age: 3600 }, // Keep completed for 1 hour
      removeOnFail: { age: 86400 },    // Keep failed for 24 hours
    },
  });

  return emailQueue;
}

/**
 * Enqueue an email for background delivery.
 * Falls back to direct execution if Redis/queue unavailable.
 *
 * @param template The function name from email.ts (e.g. 'sendWelcomeEmail')
 * @param args Arguments to pass to the function
 */
export async function enqueueEmail(template: string, args: unknown[]): Promise<void> {
  const queue = getEmailQueue();

  if (queue) {
    await queue.add('send', { template, args }, {
      // Deduplicate by template+first-arg (usually the email address)
      jobId: undefined, // Let BullMQ auto-generate
    });
    return;
  }

  // Fallback: direct send (no Redis)
  try {
    const emailModule = await import('@/lib/email');
    const fn = (emailModule as Record<string, Function>)[template];
    if (fn) {
      await fn(...args);
    }
  } catch (err) {
    console.error(`[EmailQueue] Direct fallback failed for ${template}:`, err);
  }
}
