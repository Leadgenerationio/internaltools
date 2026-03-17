/**
 * Avatar video generation worker.
 *
 * Uses InfiniteTalk (infinitalk/from-audio) on kie.ai for lip-sync video.
 * InfiniteTalk has a 15s audio limit — longer voiceovers are split into
 * ≤14s chunks, each generates a video, then FFmpeg stitches them together.
 */

import { Worker, Job } from 'bullmq';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { createRedisConnection } from '@/lib/redis';
import { logger } from '@/lib/logger';
import { refundTokens } from '@/lib/token-balance';
import { fileUrl } from '@/lib/file-url';
import type { AvatarVideoGenData, AvatarVideoGenResult } from '@/lib/job-types';

const execFileAsync = promisify(execFile);
const KIE_API_BASE = 'https://api.kie.ai/api/v1';
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_TIME_MS = 10 * 60 * 1000; // 10 min per chunk
const CHUNK_MAX_SECONDS = 14; // InfiniteTalk limit is 15s, use 14s for safety
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

async function getAudioDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'quiet', '-print_format', 'json', '-show_format', filePath,
  ]);
  return parseFloat(JSON.parse(stdout).format.duration);
}

async function splitAudio(inputPath: string, chunkDir: string, maxSeconds: number): Promise<string[]> {
  const duration = await getAudioDuration(inputPath);
  if (duration <= maxSeconds) return [inputPath]; // No split needed

  await fs.mkdir(chunkDir, { recursive: true });
  const chunks: string[] = [];
  let offset = 0;
  let idx = 0;

  while (offset < duration) {
    const chunkDuration = Math.min(maxSeconds, duration - offset);
    if (chunkDuration < 0.5) break; // Skip tiny tail

    const chunkPath = path.join(chunkDir, `chunk_${idx}.mp3`);
    await execFileAsync('ffmpeg', [
      '-y', '-ss', String(offset), '-i', inputPath,
      '-t', String(chunkDuration),
      '-c', 'copy', chunkPath,
    ]);
    chunks.push(chunkPath);
    offset += chunkDuration;
    idx++;
  }

  return chunks;
}

async function uploadChunkToS3(localPath: string, storagePath: string): Promise<string | null> {
  try {
    const { isCloudStorage, uploadFile } = await import('@/lib/storage');
    if (!isCloudStorage) return null;
    const tmpCopy = localPath + '.s3tmp';
    await fs.copyFile(localPath, tmpCopy);
    const publicUrl = await uploadFile(tmpCopy, storagePath);
    return publicUrl && publicUrl.startsWith('http') ? publicUrl : null;
  } catch {
    return null;
  }
}

async function submitAndPollInfiniteTalk(
  apiKey: string,
  imageUrl: string,
  audioUrl: string,
  label: string,
): Promise<string> {
  logger.info(`[Avatar] Submitting InfiniteTalk ${label} — audio: ${audioUrl.slice(0, 80)}`);

  const submitRes = await fetch(`${KIE_API_BASE}/jobs/createTask`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'infinitalk/from-audio',
      input: {
        image_url: imageUrl,
        audio_url: audioUrl,
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

  logger.info(`[Avatar] ${label} task: ${taskId}`);

  // Poll
  const start = Date.now();
  while (Date.now() - start < MAX_POLL_TIME_MS) {
    const pollRes = await fetch(`${KIE_API_BASE}/jobs/recordInfo?taskId=${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (pollRes.ok) {
      const pollData = await pollRes.json();
      const task = pollData.data || pollData;

      if (task.state === 'success' && task.resultJson) {
        const result = typeof task.resultJson === 'string' ? JSON.parse(task.resultJson) : task.resultJson;
        const urls = result.resultUrls || [];
        if (urls.length) return urls[0];
        throw new Error('InfiniteTalk returned no result URLs');
      }

      if (task.state === 'fail') {
        throw new Error(`InfiniteTalk failed: ${task.failMsg || 'Unknown error'}`);
      }
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error('InfiniteTalk timed out');
}

async function downloadToFile(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(outputPath, buffer);
}

async function concatenateVideos(videoPaths: string[], outputPath: string, tempDir: string): Promise<void> {
  const listFile = path.join(tempDir, 'concat_list.txt');
  const lines = videoPaths.map((p) => `file '${path.resolve(p)}'`);
  await fs.writeFile(listFile, lines.join('\n'));

  await execFileAsync('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0',
    '-i', listFile,
    '-c', 'copy', outputPath,
  ]);
}

// ─── Main processor ───────────────────────────────────────────────────────────

async function processAvatarVideo(job: Job<AvatarVideoGenData>): Promise<AvatarVideoGenResult> {
  const { companyId, userId, avatarImageUrl, voiceoverUrl, tokenCost } = job.data;
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) throw new Error('KIE_API_KEY not configured');

  const tempDir = path.join(OUTPUT_DIR, `avatar_temp_${job.id || crypto.randomUUID()}`);

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await job.updateProgress(5);

    const imagePublicUrl = resolveToPublicUrl(avatarImageUrl);

    // 1. Download voiceover to local file
    const voLocalPath = path.join(tempDir, 'voiceover.mp3');
    logger.info(`[Avatar] Downloading voiceover: ${voiceoverUrl.slice(0, 80)}`);
    const voResolvedUrl = resolveToPublicUrl(voiceoverUrl);
    await downloadToFile(voResolvedUrl, voLocalPath);

    // 2. Split audio into ≤14s chunks
    const chunkDir = path.join(tempDir, 'chunks');
    const audioChunks = await splitAudio(voLocalPath, chunkDir, CHUNK_MAX_SECONDS);
    logger.info(`[Avatar] Audio split into ${audioChunks.length} chunk(s)`);
    await job.updateProgress(10);

    // 3. Upload each chunk to S3 to get public URLs for kie.ai
    const chunkUrls: string[] = [];
    for (let i = 0; i < audioChunks.length; i++) {
      const chunkPath = audioChunks[i];
      // If original was a single chunk (no split), use the original public URL
      if (audioChunks.length === 1 && chunkPath === voLocalPath) {
        chunkUrls.push(voResolvedUrl);
        continue;
      }
      // Upload chunk to S3
      const storagePath = `longform/avatar_chunk_${crypto.randomUUID()}.mp3`;
      const publicUrl = await uploadChunkToS3(chunkPath, storagePath);
      if (!publicUrl) {
        throw new Error(`Failed to get public URL for audio chunk ${i + 1}. Cloud storage (S3) is required for avatar videos longer than 14 seconds.`);
      }
      chunkUrls.push(publicUrl);
    }

    await job.updateProgress(15);

    // 4. Generate a video for each audio chunk
    const videoPaths: string[] = [];
    const totalChunks = chunkUrls.length;

    for (let i = 0; i < totalChunks; i++) {
      const chunkLabel = `chunk ${i + 1}/${totalChunks}`;
      logger.info(`[Avatar] Generating video for ${chunkLabel}`);

      const resultUrl = await submitAndPollInfiniteTalk(apiKey, imagePublicUrl, chunkUrls[i], chunkLabel);

      const videoPath = path.join(tempDir, `video_${i}.mp4`);
      await downloadToFile(resultUrl, videoPath);
      videoPaths.push(videoPath);

      const pct = 15 + Math.round(((i + 1) / totalChunks) * 65);
      await job.updateProgress(pct);
      logger.info(`[Avatar] ${chunkLabel} complete`);
    }

    await job.updateProgress(80);

    // 5. Concatenate videos if multiple chunks
    const outputFilename = `avatar_video_${crypto.randomUUID()}.mp4`;
    const outputPath = path.join(OUTPUT_DIR, outputFilename);

    if (videoPaths.length === 1) {
      await fs.copyFile(videoPaths[0], outputPath);
    } else {
      logger.info(`[Avatar] Stitching ${videoPaths.length} video chunks`);
      await concatenateVideos(videoPaths, outputPath, tempDir);
    }

    await job.updateProgress(90);

    // 6. Upload to S3
    try {
      const { isCloudStorage, uploadFile } = await import('@/lib/storage');
      if (isCloudStorage) {
        const tmpCopy = outputPath + '.s3upload.tmp';
        await fs.copyFile(outputPath, tmpCopy);
        await uploadFile(tmpCopy, `outputs/${outputFilename}`);
      }
    } catch { /* local fallback */ }

    // 7. Get duration
    let duration = 30;
    try {
      const { getMediaDuration } = await import('@/lib/longform-stitcher');
      duration = await getMediaDuration(outputPath);
    } catch { /* fallback */ }

    await job.updateProgress(100);
    logger.info(`[Avatar] Video complete: ${outputFilename} (${duration.toFixed(1)}s, ${videoPaths.length} chunk${videoPaths.length > 1 ? 's' : ''})`);

    return {
      videoUrl: fileUrl(`outputs/${outputFilename}`),
      durationSeconds: duration,
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
  } finally {
    try { await fs.rm(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
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

  console.log('[Avatar Worker] Started (concurrency: 2)');
  return worker;
}
