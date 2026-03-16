/**
 * Avatar video generation worker.
 *
 * Processes BullMQ jobs from the 'avatar' queue.
 * Currently supports: avatar-generate-video (Creatify Aurora — pending model ID).
 */

import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '@/lib/redis';
import { logger } from '@/lib/logger';
import { refundTokens } from '@/lib/token-balance';
import type { AvatarVideoGenData, AvatarVideoGenResult } from '@/lib/job-types';

async function processAvatarVideo(job: Job<AvatarVideoGenData>): Promise<AvatarVideoGenResult> {
  const { companyId, userId, tokenCost } = job.data;

  try {
    await job.updateProgress(10);

    // TODO: Implement Creatify Aurora API call when model ID is confirmed on kie.ai marketplace
    // The integration will:
    // 1. Submit avatar image + voiceover to Creatify Aurora
    // 2. Poll for completion
    // 3. Download result video
    // 4. Save to public/outputs/
    throw new Error('Creatify Aurora model integration pending — model ID needs to be confirmed on kie.ai marketplace');

  } catch (err: any) {
    // Refund tokens on failure
    try {
      await refundTokens({
        companyId,
        userId,
        amount: tokenCost,
        description: `Refund: avatar video generation failed — ${err.message}`,
      });
    } catch { /* ignore refund errors */ }
    throw err;
  }
}

export function startAvatarWorker(): Worker | null {
  const connection = createRedisConnection();
  if (!connection) {
    console.warn('[Avatar Worker] Redis not available, worker not started');
    return null;
  }

  const worker = new Worker('avatar', async (job) => {
    if (job.name === 'avatar-generate-video') {
      return processAvatarVideo(job as Job<AvatarVideoGenData>);
    }
    throw new Error(`Unknown avatar job type: ${job.name}`);
  }, {
    connection: connection as any,
    concurrency: 2,
  });

  worker.on('completed', (job) => {
    logger.info(`[Avatar Worker] Job ${job.id} (${job.name}) completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`[Avatar Worker] Job ${job?.id} (${job?.name}) failed: ${err.message}`);
  });

  console.log('[Avatar Worker] Started (concurrency: 2)');
  return worker;
}
