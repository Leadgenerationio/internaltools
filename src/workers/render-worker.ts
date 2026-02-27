/**
 * BullMQ worker for render jobs.
 *
 * Processes render jobs from the 'render' queue.
 * Each job contains multiple render items (ad × video combos).
 * Reports progress as items complete. Handles token refunds on failure.
 */

import { Worker, Job } from 'bullmq';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { getRedis } from '@/lib/redis';
import { renderVideo } from '@/lib/ffmpeg-renderer';
import { uploadFile, isCloudStorage } from '@/lib/storage';
import { refundTokens } from '@/lib/token-balance';
import { checkTokenAlerts } from '@/lib/spend-alerts';
import { sendRenderCompleteEmail, sendRenderFailedEmail } from '@/lib/email';
import { createNotification } from '@/lib/notifications';
import { prisma } from '@/lib/prisma';
import type { RenderJobData, RenderJobResult, RenderResultItem } from '@/lib/job-types';
import type { MusicTrack } from '@/lib/types';

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'outputs');
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

/** Extract the public-relative path from a URL */
function extractPublicPath(url: string): string {
  if (url.startsWith('/api/files')) {
    const urlObj = new URL(url, 'http://localhost');
    return urlObj.searchParams.get('path') || '';
  }
  return url.startsWith('/') ? url.slice(1) : url;
}

function isPathSafe(resolvedPath: string, allowedDir: string): boolean {
  return path.normalize(resolvedPath).startsWith(path.normalize(allowedDir));
}

/** Clean output files older than 30 min */
function cleanOldOutputs(maxAgeMs = 30 * 60 * 1000): void {
  if (!fs.existsSync(OUTPUT_DIR)) return;
  const cutoff = Date.now() - maxAgeMs;
  try {
    for (const entry of fs.readdirSync(OUTPUT_DIR)) {
      const fullPath = path.join(OUTPUT_DIR, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs < cutoff) {
          if (stat.isDirectory()) fs.rmSync(fullPath, { recursive: true });
          else fs.unlinkSync(fullPath);
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

async function processRenderJob(job: Job<RenderJobData>): Promise<RenderJobResult> {
  const { items, music, quality, companyId, userId, tokenCost } = job.data;
  const totalItems = items.length;
  const results: RenderResultItem[] = [];
  let failed = 0;

  // Ensure output dir exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Clean old outputs before starting
  cleanOldOutputs();

  // Resolve music path
  let musicConfig: MusicTrack | null = null;
  if (music && music.file) {
    const filePath = extractPublicPath(music.file);
    const resolvedMusic = path.join(PUBLIC_DIR, filePath);
    if (isPathSafe(resolvedMusic, PUBLIC_DIR) && fs.existsSync(resolvedMusic)) {
      musicConfig = { ...music, file: resolvedMusic };
    }
  }

  const usingCloud = isCloudStorage;

  for (let i = 0; i < totalItems; i++) {
    const item = items[i];
    const { video, overlays, adLabel } = item;

    try {
      // Resolve video path
      const cleanPath = extractPublicPath(video.path);
      const inputPath = path.join(PUBLIC_DIR, cleanPath);

      if (!isPathSafe(inputPath, UPLOAD_DIR) || !fs.existsSync(inputPath)) {
        console.error(`[Render Worker] Video not found: ${cleanPath}`);
        failed++;
        await job.updateProgress(Math.round(((i + 1) / totalItems) * 100));
        continue;
      }

      const outputPath = path.join(OUTPUT_DIR, `${uuidv4()}_output.mp4`);

      // Compute trimmed duration
      const trimmedDuration = (video.trimEnd ?? video.duration) - (video.trimStart ?? 0);

      await renderVideo({
        inputVideoPath: inputPath,
        outputPath,
        overlays,
        music: musicConfig,
        videoWidth: video.width,
        videoHeight: video.height,
        videoDuration: trimmedDuration,
        trimStart: video.trimStart,
        trimEnd: video.trimEnd,
        quality,
      });

      // Upload to cloud storage if configured
      const storagePath = `outputs/${path.basename(outputPath)}`;
      const outputUrl = await uploadFile(outputPath, storagePath);

      results.push({
        videoId: video.id,
        originalName: video.originalName,
        adLabel,
        outputUrl,
      });

      // Clean local file if using cloud storage
      if (usingCloud) {
        try { fs.unlinkSync(outputPath); } catch { /* ignore */ }
      }
    } catch (err: any) {
      console.error(`[Render Worker] Item ${i + 1} failed:`, err.message);
      failed++;
    }

    // Report progress
    await job.updateProgress(Math.round(((i + 1) / totalItems) * 100));
  }

  // Refund tokens for failed items
  if (failed > 0 && tokenCost > 0) {
    const perItemCost = tokenCost / totalItems;
    const refundAmount = Math.round(perItemCost * failed);
    if (refundAmount > 0) {
      await refundTokens({
        companyId,
        userId,
        amount: refundAmount,
        description: `Refund: ${failed} of ${totalItems} renders failed`,
      });
    }
  }

  // Check token alerts after render
  checkTokenAlerts(companyId);

  // Send notifications (fire-and-forget)
  const videoCount = results.length;
  if (videoCount > 0) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });
      if (user) {
        sendRenderCompleteEmail(user.email, user.name || '', videoCount);
      }
    } catch { /* ignore */ }

    createNotification(
      userId,
      'RENDER_COMPLETE',
      `${videoCount} video${videoCount !== 1 ? 's' : ''} ready`,
      `Your render is complete. ${videoCount} video${videoCount !== 1 ? 's are' : ' is'} ready to download.`,
      '/'
    );
  } else {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });
      if (user) {
        sendRenderFailedEmail(user.email, user.name || '', failed, totalItems);
      }
    } catch { /* ignore */ }

    createNotification(
      userId,
      'RENDER_FAILED',
      'Render failed',
      'Your render failed. Please try again.',
      '/'
    );
  }

  return { results, failed, tokensUsed: tokenCost };
}

/**
 * Start the render worker. Call this from the worker entry point.
 */
export function startRenderWorker(): Worker<RenderJobData> | null {
  const connection = getRedis();
  if (!connection) {
    console.warn('[Render Worker] Redis not available, worker not started');
    return null;
  }

  const worker = new Worker<RenderJobData>('render', processRenderJob, {
    connection: connection as any,
    concurrency: 2,
  });

  worker.on('completed', (job) => {
    console.log(`[Render Worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Render Worker] Job ${job?.id} failed:`, err.message);
  });

  console.log('[Render Worker] Started (concurrency: 2)');
  return worker;
}
