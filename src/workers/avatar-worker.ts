/**
 * Avatar video generation worker.
 *
 * Processes BullMQ jobs from the 'avatar' queue.
 * Uses InfiniteTalk (infinitalk/from-audio) on kie.ai for lip-sync video.
 */

import { Worker, Job } from 'bullmq';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { createRedisConnection } from '@/lib/redis';
import { logger } from '@/lib/logger';
import { refundTokens } from '@/lib/token-balance';
import { fileUrl } from '@/lib/file-url';
import type { AvatarVideoGenData, AvatarVideoGenResult } from '@/lib/job-types';

const KIE_API_BASE = 'https://api.kie.ai/api/v1';
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_TIME_MS = 10 * 60 * 1000; // 10 minutes
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'outputs');

/**
 * Resolve a URL to an absolute public URL for the kie.ai API.
 * /api/files?path=xxx → https://domain/api/files?path=xxx
 */
function resolveToPublicUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;

  // Check for S3 public URL first
  const s3PublicUrl = process.env.S3_PUBLIC_URL;
  if (s3PublicUrl && url.includes('/api/files')) {
    const match = url.match(/[?&]path=([^&]+)/);
    if (match) return `${s3PublicUrl}/${decodeURIComponent(match[1])}`;
  }

  // Fall back to app URL
  const base = process.env.APP_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
    || 'http://localhost:3000';
  return `${base.replace(/\/+$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
}

async function processAvatarVideo(job: Job<AvatarVideoGenData>): Promise<AvatarVideoGenResult> {
  const { companyId, userId, avatarImageUrl, voiceoverUrl, tokenCost } = job.data;
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) throw new Error('KIE_API_KEY not configured');

  const tempDir = path.join(OUTPUT_DIR, `avatar_temp_${job.id || crypto.randomUUID()}`);

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await job.updateProgress(5);

    // Resolve URLs to absolute public URLs for kie.ai
    const imagePublicUrl = resolveToPublicUrl(avatarImageUrl);
    const audioPublicUrl = resolveToPublicUrl(voiceoverUrl);

    logger.info(`[Avatar] Submitting InfiniteTalk job — image: ${imagePublicUrl.slice(0, 80)}, audio: ${audioPublicUrl.slice(0, 80)}`);

    // 1. Submit InfiniteTalk task
    const submitRes = await fetch(`${KIE_API_BASE}/jobs/createTask`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'infinitalk/from-audio',
        input: {
          image_url: imagePublicUrl,
          audio_url: audioPublicUrl,
          prompt: 'A person speaking naturally to camera, natural head movements and expressions',
          resolution: '720p',
        },
      }),
    });

    if (!submitRes.ok) {
      const body = await submitRes.text().catch(() => '');
      throw new Error(`InfiniteTalk submit failed (${submitRes.status}): ${body}`);
    }

    const submitData = await submitRes.json();
    const taskId = submitData.data?.taskId || submitData.taskId;
    if (!taskId) throw new Error('kie.ai returned no taskId');

    logger.info(`[Avatar] InfiniteTalk task submitted: ${taskId}`);
    await job.updateProgress(15);

    // 2. Poll for completion
    const start = Date.now();
    let resultUrls: string[] = [];

    while (Date.now() - start < MAX_POLL_TIME_MS) {
      const pollRes = await fetch(`${KIE_API_BASE}/jobs/recordInfo?taskId=${taskId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      if (pollRes.ok) {
        const pollData = await pollRes.json();
        const task = pollData.data || pollData;

        if (task.state === 'success' && task.resultJson) {
          const result = typeof task.resultJson === 'string' ? JSON.parse(task.resultJson) : task.resultJson;
          resultUrls = result.resultUrls || [];
          break;
        }

        if (task.state === 'fail') {
          throw new Error(`InfiniteTalk failed: ${task.failMsg || 'Unknown error'}`);
        }

        // Update progress based on elapsed time
        const elapsed = Date.now() - start;
        const pct = Math.min(85, 15 + Math.round((elapsed / MAX_POLL_TIME_MS) * 70));
        await job.updateProgress(pct);
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    if (!resultUrls.length) {
      throw new Error('InfiniteTalk timed out — no result after 10 minutes');
    }

    await job.updateProgress(85);

    // 3. Download result video
    const videoUrl = resultUrls[0];
    logger.info(`[Avatar] Downloading result: ${videoUrl.slice(0, 120)}`);

    const dlRes = await fetch(videoUrl);
    if (!dlRes.ok) throw new Error(`Video download failed (${dlRes.status})`);
    const buffer = Buffer.from(await dlRes.arrayBuffer());

    const outputFilename = `avatar_video_${crypto.randomUUID()}.mp4`;
    const outputPath = path.join(OUTPUT_DIR, outputFilename);
    await fs.writeFile(outputPath, buffer);

    await job.updateProgress(90);

    // 4. Upload to S3 if configured
    try {
      const { isCloudStorage, uploadFile } = await import('@/lib/storage');
      if (isCloudStorage) {
        const tmpCopy = outputPath + '.s3upload.tmp';
        await fs.copyFile(outputPath, tmpCopy);
        await uploadFile(tmpCopy, `outputs/${outputFilename}`);
      }
    } catch { /* local fallback */ }

    // 5. Get duration
    let duration = 30;
    try {
      const { getMediaDuration } = await import('@/lib/longform-stitcher');
      duration = await getMediaDuration(outputPath);
    } catch { /* fallback */ }

    await job.updateProgress(100);
    logger.info(`[Avatar] Video complete: ${outputFilename} (${duration.toFixed(1)}s)`);

    return {
      videoUrl: fileUrl(`outputs/${outputFilename}`),
      durationSeconds: duration,
      tokensUsed: tokenCost,
    };

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
  } finally {
    try { await fs.rm(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
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
