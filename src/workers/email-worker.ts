/**
 * Email worker — processes email jobs from BullMQ with retries.
 *
 * Dynamically imports the email function by name and calls it with saved args.
 * 3 retries with exponential backoff (5s, 10s, 20s) configured in email-queue.ts.
 */

import { Worker } from 'bullmq';
import { createRedisConnection } from '@/lib/redis';
import type { EmailJobData } from '@/lib/email-queue';

/** Allowed email function names — must match exports from src/lib/email.ts */
const ALLOWED_TEMPLATES = new Set([
  'sendWelcomeEmail',
  'sendPasswordResetEmail',
  'sendPlanUpgradeEmail',
  'sendTokenBudgetAlert',
  'sendPaymentReceiptEmail',
  'sendTeamInviteEmail',
  'sendRenderCompleteEmail',
  'sendRenderFailedEmail',
  'sendSubscriptionRenewalEmail',
  'sendTicketCreatedEmail',
  'sendTicketReplyEmail',
]);

/**
 * Start the email worker. Returns the Worker instance or null if Redis unavailable.
 */
export function startEmailWorker(): Worker<EmailJobData> | null {
  const connection = createRedisConnection();
  if (!connection) {
    console.warn('[EmailWorker] Redis not available — email worker not started');
    return null;
  }

  const worker = new Worker<EmailJobData>(
    'email',
    async (job) => {
      const { template, args } = job.data;

      if (!ALLOWED_TEMPLATES.has(template)) {
        throw new Error(`Rejected email template: ${template}`);
      }

      console.log(`[EmailWorker] Processing ${template} (attempt ${job.attemptsMade + 1}/${(job.opts.attempts ?? 3)})`);

      const emailModule = await import('@/lib/email');
      const fn = (emailModule as Record<string, Function>)[template];

      if (!fn) {
        throw new Error(`Unknown email template: ${template}`);
      }

      const result = await fn(...args);

      // If the email function returns { success: false }, treat as a failure to trigger retry
      if (result && typeof result === 'object' && 'success' in result && !result.success) {
        throw new Error(`Email send failed for ${template}`);
      }

      return result;
    },
    {
      connection: connection as any,
      concurrency: 5, // Process up to 5 emails concurrently
      limiter: {
        max: 20,     // Max 20 emails per 10 seconds (Resend default rate limit)
        duration: 10_000,
      },
    }
  );

  worker.on('completed', (job) => {
    console.log(`[EmailWorker] ${job.data.template} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[EmailWorker] ${job?.data.template} failed:`, err.message);
  });

  console.log('[EmailWorker] Started');
  return worker;
}
