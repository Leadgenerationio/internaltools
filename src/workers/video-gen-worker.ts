/**
 * BullMQ worker for video generation jobs.
 *
 * Processes video-gen jobs from the 'video-gen' queue.
 * Supports both Veo API (/veo/) and Market API (/jobs/) patterns.
 * Submits to kie.ai, polls for results, downloads videos.
 * Reports progress as videos complete. Handles token refunds on failure.
 */

import { Worker, Job } from 'bullmq';
import { mkdir } from 'fs/promises';
import fs from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getRedis } from '@/lib/redis';
import { getVideoInfo } from '@/lib/get-video-info';
import { logger } from '@/lib/logger';
import { trackVeoUsage } from '@/lib/track-usage';
import { refundTokens } from '@/lib/token-balance';
import { calculateVeoTokens } from '@/lib/token-pricing';
import { fileUrl } from '@/lib/file-url';
import { VIDEO_MODELS } from '@/lib/types';
import type { VideoModel } from '@/lib/types';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { VideoGenJobData, VideoGenJobResult, VideoGenResultItem } from '@/lib/job-types';

const execFileAsync = promisify(execFile);

const KIE_API_BASE = 'https://api.kie.ai/api/v1';
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_TIME_MS = 4 * 60 * 1000;
const MAX_RETRIES = 2;

// ── Market API helpers (Kling, Sora) ──

function buildMarketInput(model: VideoModel, prompt: string, ar: string, includeSound: boolean): Record<string, any> {
  if (model.id.startsWith('sora-2')) {
    return {
      prompt,
      aspect_ratio: ar === '9:16' ? 'portrait' : 'landscape',
      n_frames: String(model.duration),
      remove_watermark: true,
      upload_method: 's3',
    };
  }

  if (model.id.startsWith('kling')) {
    return {
      prompt,
      sound: includeSound,
      aspect_ratio: ar,
      duration: String(model.duration),
    };
  }

  throw new Error(`Unknown market model: ${model.id}`);
}

async function submitAndPollMarket(apiKey: string, model: VideoModel, prompt: string, ar: string, includeSound: boolean): Promise<string[]> {
  // Submit
  const submitRes = await fetch(`${KIE_API_BASE}/jobs/createTask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model.id,
      input: buildMarketInput(model, prompt, ar, includeSound),
    }),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => '');
    if (submitRes.status === 429) throw new Error('Rate limited by kie.ai (429)');
    if (submitRes.status === 402) throw new Error('Insufficient kie.ai credits');
    throw new Error(`kie.ai submit failed (${submitRes.status}): ${errText}`);
  }

  const submitData = await submitRes.json();
  const taskId = submitData?.data?.taskId;
  if (!taskId) throw new Error(`kie.ai returned no taskId: ${JSON.stringify(submitData)}`);

  logger.info('Market job submitted', { taskId, model: model.id });

  // Poll
  const startTime = Date.now();
  while (Date.now() - startTime < MAX_POLL_TIME_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const res = await fetch(
      `${KIE_API_BASE}/jobs/recordInfo?taskId=${taskId}`,
      { headers: { 'Authorization': `Bearer ${apiKey}` } }
    );

    if (!res.ok) continue;

    const pollData = await res.json();
    const state = pollData?.data?.state;

    if (state === 'success') {
      const resultJsonStr = pollData?.data?.resultJson;
      if (!resultJsonStr) return [];
      try {
        const parsed = JSON.parse(resultJsonStr);
        return Array.isArray(parsed.resultUrls) ? parsed.resultUrls : [];
      } catch {
        return [];
      }
    }

    if (state === 'fail') {
      const reason = pollData?.data?.failMsg || pollData?.data?.failCode || 'generation failed';
      throw new Error(`Video generation failed: ${reason}`);
    }
  }

  return [];
}

// ── Veo API helpers ──

async function submitAndPollVeo(apiKey: string, modelId: string, prompt: string, ar: string): Promise<string[]> {
  // Submit
  const submitRes = await fetch(`${KIE_API_BASE}/veo/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt: prompt.trim(),
      model: modelId,
      aspect_ratio: ar,
    }),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => '');
    if (submitRes.status === 429) throw new Error('Rate limited by kie.ai (429)');
    if (submitRes.status === 402) throw new Error('Insufficient kie.ai credits');
    throw new Error(`kie.ai submit failed (${submitRes.status}): ${errText}`);
  }

  const submitData = await submitRes.json();
  const taskId = submitData?.data?.taskId;
  if (!taskId) throw new Error(`kie.ai returned no taskId: ${JSON.stringify(submitData)}`);

  logger.info('Veo job submitted', { taskId, model: modelId });

  // Poll
  const startTime = Date.now();
  while (Date.now() - startTime < MAX_POLL_TIME_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const res = await fetch(
      `${KIE_API_BASE}/veo/record-info?taskId=${taskId}`,
      { headers: { 'Authorization': `Bearer ${apiKey}` } }
    );

    if (!res.ok) continue;

    const pollData = await res.json();
    const flag = pollData?.data?.successFlag;

    if (flag === 1) {
      const urlsRaw = pollData?.data?.response?.resultUrls;
      if (typeof urlsRaw === 'string') {
        try { return JSON.parse(urlsRaw); } catch { return [urlsRaw]; }
      }
      if (Array.isArray(urlsRaw)) return urlsRaw;
      return [];
    }

    if (flag === 2 || flag === 3) {
      const reason = pollData?.data?.errorMessage || pollData?.data?.failReason || 'generation failed';
      throw new Error(`Video generation failed: ${reason}`);
    }
  }

  return [];
}

// ── Unified single-video generator ──

async function generateSingleVideo(
  apiKey: string,
  prompt: string,
  validModel: VideoModel,
  aspectRatio: string,
  includeSound: boolean,
  apiType: 'veo' | 'market',
  index: number,
): Promise<VideoGenResultItem> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = attempt * 5000;
      logger.info(`Retrying generation ${index + 1} (attempt ${attempt + 1}) after ${backoff}ms`);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }

    try {
      // Submit + Poll (branched by API type)
      let resultUrls: string[];

      if (apiType === 'market') {
        resultUrls = await submitAndPollMarket(apiKey, validModel, prompt, aspectRatio, includeSound);
      } else {
        resultUrls = await submitAndPollVeo(apiKey, validModel.id, prompt, aspectRatio);
      }

      if (resultUrls.length === 0) {
        throw new Error(`Video generation ${index + 1} timed out`);
      }

      // Download video
      const id = crypto.randomUUID();
      const filename = `${id}.mp4`;
      const filepath = path.join(UPLOAD_DIR, filename);

      const downloadRes = await fetch(resultUrls[0]);
      if (!downloadRes.ok) {
        throw new Error(`Video download failed (${downloadRes.status})`);
      }
      const buffer = Buffer.from(await downloadRes.arrayBuffer());
      fs.writeFileSync(filepath, buffer);

      // Strip audio if needed (only for models that produce audio)
      if (!includeSound && validModel.supportsSound) {
        const silentPath = filepath.replace('.mp4', '_silent.mp4');
        try {
          await execFileAsync('ffmpeg', ['-y', '-i', filepath, '-c:v', 'copy', '-an', silentPath]);
          fs.unlinkSync(filepath);
          fs.renameSync(silentPath, filepath);
        } catch {
          if (fs.existsSync(silentPath)) fs.unlinkSync(silentPath);
        }
      }

      // Get video info
      const info = await getVideoInfo(filepath);

      // Generate thumbnail
      const thumbFilename = `${id}_thumb.jpg`;
      const thumbPath = path.join(UPLOAD_DIR, thumbFilename);
      try {
        await execFileAsync('ffmpeg', [
          '-y', '-i', filepath,
          '-vframes', '1', '-ss', '0',
          '-vf', 'scale=180:-1',
          thumbPath,
        ]);
      } catch { /* ignore */ }

      return {
        id,
        filename,
        originalName: `AI Generated ${index + 1}`,
        path: fileUrl(`uploads/${filename}`),
        duration: info.duration,
        width: info.width,
        height: info.height,
        thumbnail: fileUrl(`uploads/${thumbFilename}`),
      };
    } catch (err: any) {
      lastError = err;
      const isRetryable = /503|502|500|429|timeout|ECONNRESET|ETIMEDOUT/i.test(err.message);
      if (!isRetryable || attempt >= MAX_RETRIES) throw err;
      logger.warn(`Generation ${index + 1} failed (retryable)`, { error: err.message, attempt });
    }
  }

  throw lastError || new Error(`Generation ${index + 1} failed`);
}

async function processVideoGenJob(job: Job<VideoGenJobData>): Promise<VideoGenJobResult> {
  const { companyId, userId, prompt, count, aspectRatio, model, includeSound, apiType, tokenCost } = job.data;

  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    throw new Error('KIE_API_KEY not configured');
  }

  const validModel = VIDEO_MODELS.find((m) => m.id === model);
  if (!validModel) throw new Error(`Invalid model: ${model}`);

  const videoDuration = validModel.duration;

  // Ensure upload dir exists
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }

  // Generate videos in parallel
  const promises = Array.from({ length: count }, (_, i) =>
    generateSingleVideo(apiKey, prompt, validModel, aspectRatio, includeSound, apiType, i)
  );

  const settled = await Promise.allSettled(promises);

  const videos: VideoGenResultItem[] = [];
  const failures: string[] = [];

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    if (result.status === 'fulfilled') {
      videos.push(result.value);
    } else {
      failures.push(result.reason?.message || 'Unknown error');
    }
    await job.updateProgress(Math.round(((i + 1) / count) * 100));
  }

  // Refund tokens for failed videos (per-model cost)
  if (failures.length > 0) {
    const refundAmount = calculateVeoTokens(failures.length, model);
    await refundTokens({
      companyId,
      userId,
      amount: refundAmount,
      description: `Refund: ${failures.length} AI video${failures.length !== 1 ? 's' : ''} failed to generate`,
    });
  }

  const tokensCharged = calculateVeoTokens(videos.length, model);

  // Track API cost
  trackVeoUsage({
    companyId,
    userId,
    model,
    videoCount: videos.length,
    videoSeconds: videos.length * videoDuration,
    endpoint: 'generate-video',
    durationMs: 0,
    success: videos.length > 0,
    tokensCost: tokensCharged,
    ...(failures.length > 0 && { errorMessage: failures.join('; ') }),
  });

  if (videos.length === 0) {
    throw new Error(failures[0] || 'All video generations failed');
  }

  return {
    videos,
    failed: failures.length,
    tokensUsed: tokensCharged,
    ...(failures.length > 0 && { warning: `${failures.length} of ${count} videos failed to generate` }),
  };
}

/**
 * Start the video-gen worker. Call this from the worker entry point.
 */
export function startVideoGenWorker(): Worker<VideoGenJobData> | null {
  const connection = getRedis();
  if (!connection) {
    console.warn('[VideoGen Worker] Redis not available, worker not started');
    return null;
  }

  const worker = new Worker<VideoGenJobData>('video-gen', processVideoGenJob, {
    connection: connection as any,
    concurrency: 2,
  });

  worker.on('completed', (job) => {
    logger.info(`[VideoGen Worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`[VideoGen Worker] Job ${job?.id} failed: ${err.message}`);
  });

  console.log('[VideoGen Worker] Started (concurrency: 2)');
  return worker;
}
