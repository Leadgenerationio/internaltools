/**
 * Avatar video generation worker.
 *
 * Uses Creatify Aurora API for lip-sync video generation.
 * Accepts an avatar image + voiceover audio, returns a talking-head video.
 * No audio duration limit — Creatify handles full-length audio internally.
 */

import { Worker, Job } from 'bullmq';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { createRedisConnection } from '@/lib/redis';
import { logger } from '@/lib/logger';

const execFileAsync = promisify(execFile);
import { refundTokens } from '@/lib/token-balance';
import { fileUrl } from '@/lib/file-url';
import type { AvatarVideoGenData, AvatarVideoGenResult } from '@/lib/job-types';

const CREATIFY_API_BASE = 'https://api.creatify.ai/api';
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_TIME_MS = 20 * 60 * 1000; // 20 min
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'outputs');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveToPublicUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const s3PublicUrl = process.env.S3_PUBLIC_URL;
  if (s3PublicUrl && url.includes('/api/files')) {
    const match = url.match(/[?&]path=([^&]+)/);
    if (match) return `${s3PublicUrl}/${decodeURIComponent(match[1])}`;
  }
  const base = process.env.APP_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
    || 'http://localhost:3000';
  return `${base.replace(/\/+$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
}

async function downloadToFile(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(outputPath, buffer);
}

/** Crop/scale video to 9:16 (1080x1920) for reels. Centers the subject. */
async function cropToReels(inputPath: string, outputPath: string): Promise<void> {
  // Scale so the shorter dimension fills the target, then center-crop
  await execFileAsync('ffmpeg', [
    '-y', '-i', inputPath,
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    outputPath,
  ]);
}

// ─── Creatify Aurora API ──────────────────────────────────────────────────────

interface CreatifyAuroraResponse {
  id: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  progress: number;
  video_output: string | null;
  failed_reason: string | null;
  credits_used: number;
  duration: number | null;
}

function getCreatifyHeaders(): Record<string, string> {
  const apiId = process.env.CREATIFY_API_ID;
  const apiKey = process.env.CREATIFY_API_KEY;
  if (!apiId || !apiKey) throw new Error('CREATIFY_API_ID and CREATIFY_API_KEY must be configured');
  return {
    'X-API-ID': apiId,
    'X-API-KEY': apiKey,
    'Content-Type': 'application/json',
  };
}

async function submitCreatifyAurora(imageUrl: string, audioUrl: string): Promise<string> {
  logger.info(`[Avatar] Submitting Creatify Aurora — image: ${imageUrl.slice(0, 80)}, audio: ${audioUrl.slice(0, 80)}`);

  const res = await fetch(`${CREATIFY_API_BASE}/aurora/`, {
    method: 'POST',
    headers: getCreatifyHeaders(),
    body: JSON.stringify({
      image: imageUrl,
      audio: audioUrl,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Creatify Aurora submit failed (${res.status}): ${body}`);
  }

  const data: CreatifyAuroraResponse = await res.json();
  if (!data.id) throw new Error('Creatify returned no job ID');

  logger.info(`[Avatar] Creatify Aurora job: ${data.id} (status: ${data.status})`);
  return data.id;
}

// ─── Main processor ───────────────────────────────────────────────────────────

async function processAvatarVideo(job: Job<AvatarVideoGenData>): Promise<AvatarVideoGenResult> {
  const { companyId, userId, avatarImageUrl, voiceoverUrl, tokenCost } = job.data;

  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await job.updateProgress(5);

    // 1. Resolve URLs to public-accessible URLs
    const imagePublicUrl = resolveToPublicUrl(avatarImageUrl);
    const audioPublicUrl = resolveToPublicUrl(voiceoverUrl);
    await job.updateProgress(10);

    // 2. Submit to Creatify Aurora
    const creatifyJobId = await submitCreatifyAurora(imagePublicUrl, audioPublicUrl);
    await job.updateProgress(15);

    // 3. Poll until complete
    const pollStartProgress = 15;
    const pollEndProgress = 85;
    const pollStart = Date.now();
    const headers = getCreatifyHeaders();
    let videoUrl: string | null = null;
    let durationSeconds = 30;

    while (Date.now() - pollStart < MAX_POLL_TIME_MS) {
      const res = await fetch(`${CREATIFY_API_BASE}/aurora/${creatifyJobId}/`, { headers });

      if (res.ok) {
        const data: CreatifyAuroraResponse = await res.json();

        if (data.status === 'done' && data.video_output) {
          videoUrl = data.video_output;
          durationSeconds = data.duration || 30;
          logger.info(`[Avatar] Creatify Aurora complete — credits: ${data.credits_used}, duration: ${durationSeconds}s`);
          break;
        }

        if (data.status === 'failed' || data.failed_reason) {
          throw new Error(`Creatify Aurora failed: ${data.failed_reason || 'Unknown error'}`);
        }

        // Update progress based on Creatify's progress
        if (data.progress > 0) {
          const scaledProgress = pollStartProgress + Math.round(data.progress * (pollEndProgress - pollStartProgress));
          await job.updateProgress(Math.min(scaledProgress, pollEndProgress));
        }
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    if (!videoUrl) {
      throw new Error('Creatify Aurora timed out after 20 minutes');
    }

    await job.updateProgress(85);

    // 4. Download the output video
    const rawFilename = `avatar_raw_${crypto.randomUUID()}.mp4`;
    const rawPath = path.join(OUTPUT_DIR, rawFilename);
    logger.info(`[Avatar] Downloading output video`);
    await downloadToFile(videoUrl, rawPath);
    await job.updateProgress(87);

    // 5. Crop to 9:16 reels format (1080x1920)
    const outputFilename = `avatar_video_${crypto.randomUUID()}.mp4`;
    const outputPath = path.join(OUTPUT_DIR, outputFilename);
    logger.info(`[Avatar] Cropping to 9:16 reels format`);
    await cropToReels(rawPath, outputPath);
    await fs.unlink(rawPath).catch(() => {}); // clean up raw file
    await job.updateProgress(92);

    // 6. Upload to S3
    try {
      const { isCloudStorage, uploadFile } = await import('@/lib/storage');
      if (isCloudStorage) {
        const tmpCopy = outputPath + '.s3upload.tmp';
        await fs.copyFile(outputPath, tmpCopy);
        await uploadFile(tmpCopy, `outputs/${outputFilename}`);
      }
    } catch { /* local fallback */ }

    // 7. Verify output
    const stat = await fs.stat(outputPath);
    if (stat.size < 1000) {
      throw new Error('Output video file is too small — likely corrupt');
    }

    await job.updateProgress(100);
    logger.info(`[Avatar] Video complete: ${outputFilename} (${durationSeconds.toFixed(1)}s)`);

    return {
      videoUrl: fileUrl(`outputs/${outputFilename}`),
      durationSeconds,
      tokensUsed: tokenCost,
    };

  } catch (err: any) {
    try {
      await refundTokens({
        companyId,
        userId,
        amount: tokenCost,
        description: `Refund: avatar video generation failed — ${err.message}`,
      });
    } catch { /* ignore */ }
    throw err;
  }
}

// ─── Worker entry point ───────────────────────────────────────────────────────

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

  console.log('[Avatar Worker] Started (concurrency: 2, engine: Creatify Aurora)');
  return worker;
}
