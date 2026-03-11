/**
 * BullMQ worker for longform video generation jobs.
 *
 * Pipeline per variant:
 *   1. Generate voiceover (ElevenLabs)
 *   2. Generate b-roll clips (kie.ai) — optional
 *   3. Normalize + stitch video (FFmpeg)
 *   4. Add captions (Submagic) — optional
 *
 * Reports granular progress. Handles partial success and token refunds.
 */

import { Worker, Job } from 'bullmq';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRedisConnection } from '@/lib/redis';
import { logger } from '@/lib/logger';
import { refundTokens } from '@/lib/token-balance';
import { calculateLongformTokens } from '@/lib/token-pricing';
import { fileUrl } from '@/lib/file-url';
import { generateScriptVoiceover } from '@/lib/elevenlabs';
import { assembleAd, getMediaDuration } from '@/lib/longform-stitcher';
import { captionVideo } from '@/lib/submagic';
import type { LongformJobData, LongformJobResult } from '@/lib/job-types';
import type { LongformResultItem } from '@/lib/longform-types';

const KIE_API_BASE = 'https://api.kie.ai/api/v1';
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'outputs');
const TEMP_BASE = path.join(process.cwd(), 'public', 'outputs', 'longform_temp');
const POLL_INTERVAL_MS = 15_000;
const MAX_POLL_TIME_MS = 10 * 60 * 1000; // 10 minutes for b-roll

// ─── B-roll generation helpers (reuses kie.ai Veo API) ──────────────────────

async function generateBrollClip(
  apiKey: string,
  prompt: string,
  outputPath: string,
): Promise<string | null> {
  try {
    // Submit to kie.ai (veo3_fast for speed)
    const submitRes = await fetch(`${KIE_API_BASE}/veo/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        prompt: prompt.trim().slice(0, 1800),
        model: 'veo3_fast',
        aspect_ratio: '9:16',
      }),
    });

    if (!submitRes.ok) return null;

    const submitData = await submitRes.json();
    const taskId = submitData?.data?.taskId;
    if (!taskId) return null;

    // Poll for result
    const start = Date.now();
    while (Date.now() - start < MAX_POLL_TIME_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const res = await fetch(
        `${KIE_API_BASE}/veo/record-info?taskId=${taskId}`,
        { headers: { 'Authorization': `Bearer ${apiKey}` } },
      );
      if (!res.ok) continue;

      const pollData = await res.json();
      const flag = pollData?.data?.successFlag;

      if (flag === 1) {
        const urlsRaw = pollData?.data?.response?.resultUrls;
        let videoUrl: string | null = null;

        if (typeof urlsRaw === 'string') {
          try { videoUrl = JSON.parse(urlsRaw)[0]; } catch { videoUrl = urlsRaw; }
        } else if (Array.isArray(urlsRaw) && urlsRaw.length > 0) {
          videoUrl = urlsRaw[0];
        }

        if (!videoUrl) return null;

        // Download
        const dlRes = await fetch(videoUrl);
        if (!dlRes.ok) return null;
        const buffer = Buffer.from(await dlRes.arrayBuffer());
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, buffer);
        return outputPath;
      }

      if (flag === 2 || flag === 3) return null; // failed
    }

    return null; // timeout
  } catch (err: any) {
    logger.warn('[Longform] B-roll clip generation failed', { prompt: prompt.slice(0, 60), error: err.message });
    return null;
  }
}

// ─── Get a public URL for a local file (for Submagic) ───────────────────────

async function getPublicUrl(localPath: string): Promise<string | null> {
  // If S3/CDN is configured, upload the file and return the public URL
  try {
    const { uploadFile } = await import('@/lib/storage');
    const storagePath = `longform/${path.basename(localPath)}`;
    const publicUrl = await uploadFile(localPath, storagePath);
    return publicUrl || null;
  } catch {
    // No cloud storage configured — can't get a public URL
    return null;
  }
}

// ─── Main pipeline processor ────────────────────────────────────────────────

async function processLongformJob(job: Job<LongformJobData>): Promise<LongformJobResult> {
  const { companyId, userId, scripts, voiceConfig, captionConfig, skipBroll, hookClipPath, tokenCost } = job.data;

  const results: LongformResultItem[] = [];
  const failures: string[] = [];
  let tokensRefunded = 0;

  const jobTempDir = path.join(TEMP_BASE, job.id || crypto.randomUUID());

  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.mkdir(jobTempDir, { recursive: true });

    const kieApiKey = process.env.KIE_API_KEY;
    const totalVariants = scripts.length;

    for (let vi = 0; vi < scripts.length; vi++) {
      const script = scripts[vi];
      const variant = script.variant.replace(/[^a-zA-Z0-9_-]/g, '_');
      const variantDir = path.join(jobTempDir, variant);
      await fs.mkdir(variantDir, { recursive: true });

      const baseProgress = (vi / totalVariants) * 100;
      const variantWeight = 100 / totalVariants;

      try {
        // ── Stage 1: Voiceover (0-15% of variant) ─────────────────────
        await job.updateProgress(Math.round(baseProgress + variantWeight * 0.02));
        logger.info(`[Longform] Generating voiceover for [${variant}]`);

        const voicePaths = await generateScriptVoiceover(script, voiceConfig, variantDir);
        await job.updateProgress(Math.round(baseProgress + variantWeight * 0.15));

        // ── Stage 2: B-roll (15-60% of variant) ──────────────────────
        const brollClips: string[] = [];

        if (!skipBroll && kieApiKey && script.suggestedBroll.length > 0) {
          logger.info(`[Longform] Generating b-roll for [${variant}]`);
          const brollDir = path.join(variantDir, 'broll');
          await fs.mkdir(brollDir, { recursive: true });

          // Limit to 3 b-roll clips to save cost/time
          const prompts = script.suggestedBroll.slice(0, 3);

          // Generate sequentially to limit memory usage
          for (let bi = 0; bi < prompts.length; bi++) {
            const clipPath = path.join(brollDir, `broll_${bi}.mp4`);
            const result = await generateBrollClip(kieApiKey, prompts[bi], clipPath);
            if (result) brollClips.push(result);

            const brollProgress = 0.15 + (0.45 * (bi + 1)) / prompts.length;
            await job.updateProgress(Math.round(baseProgress + variantWeight * brollProgress));
          }
        } else {
          // If skipping b-roll and no clips at all, generate a single placeholder
          if (kieApiKey) {
            logger.info(`[Longform] Generating placeholder video for [${variant}]`);
            const placeholderPath = path.join(variantDir, 'placeholder.mp4');
            const result = await generateBrollClip(
              kieApiKey,
              'Professional person talking to camera, modern setting, vertical video, natural lighting, UGC style',
              placeholderPath,
            );
            if (result) brollClips.push(result);
          }
          await job.updateProgress(Math.round(baseProgress + variantWeight * 0.60));
        }

        if (brollClips.length === 0) {
          throw new Error(`No video clips produced for variant [${variant}]`);
        }

        // ── Stage 3: Stitch (60-75% of variant) ─────────────────────
        logger.info(`[Longform] Assembling video for [${variant}]`);
        const stitchDir = path.join(variantDir, 'stitch');
        const rawVideoPath = path.join(variantDir, `raw_${variant}.mp4`);

        await assembleAd({
          hookClipPath: hookClipPath && existsSync(hookClipPath) ? hookClipPath : undefined,
          brollClips,
          voiceoverPath: voicePaths.fullAudio,
          outputPath: rawVideoPath,
          tempDir: stitchDir,
        });

        await job.updateProgress(Math.round(baseProgress + variantWeight * 0.75));

        // ── Stage 4: Caption (75-95% of variant) ────────────────────
        let finalVideoPath = rawVideoPath;
        let captioned = false;

        if (captionConfig.enabled && process.env.SUBMAGIC_API_KEY) {
          logger.info(`[Longform] Adding captions for [${variant}]`);

          // Need a public URL for Submagic
          const publicUrl = await getPublicUrl(rawVideoPath);

          if (publicUrl) {
            const captionedPath = path.join(variantDir, `FINAL_${variant}.mp4`);
            try {
              await captionVideo(publicUrl, captionedPath, captionConfig, `Longform - ${variant}`);
              finalVideoPath = captionedPath;
              captioned = true;
            } catch (err: any) {
              logger.warn(`[Longform] Captioning failed for [${variant}], using raw video`, { error: err.message });
            }
          } else {
            logger.warn(`[Longform] No public URL available for captioning [${variant}] — skipping`);
          }
        }

        await job.updateProgress(Math.round(baseProgress + variantWeight * 0.95));

        // ── Finalize: Move to outputs ────────────────────────────────
        const outputId = crypto.randomUUID();
        const outputFilename = `longform_${variant}_${outputId}.mp4`;
        const outputPath = path.join(OUTPUT_DIR, outputFilename);
        await fs.copyFile(finalVideoPath, outputPath);

        const duration = await getMediaDuration(outputPath).catch(() => 30);

        results.push({
          variant: script.variant,
          videoUrl: fileUrl(`outputs/${outputFilename}`),
          captioned,
          durationSeconds: duration,
        });

        await job.updateProgress(Math.round(baseProgress + variantWeight));
        logger.info(`[Longform] Variant [${variant}] complete`);

      } catch (err: any) {
        logger.error(`[Longform] Variant [${variant}] failed`, { error: err.message });
        failures.push(`${variant}: ${err.message}`);
      }
    }

    // Refund tokens for failed variants
    if (failures.length > 0) {
      const refundAmount = calculateLongformTokens(failures.length, skipBroll);
      await refundTokens({
        companyId,
        userId,
        amount: refundAmount,
        description: `Refund: ${failures.length} longform variant${failures.length !== 1 ? 's' : ''} failed`,
      });
      tokensRefunded = refundAmount;
    }

    if (results.length === 0) {
      throw new Error(failures[0] || 'All longform variants failed');
    }

    const tokensUsed = calculateLongformTokens(results.length, skipBroll);

    return {
      videos: results,
      failed: failures.length,
      tokensUsed,
      ...(failures.length > 0 && { warning: `${failures.length} of ${scripts.length} variants failed` }),
    };

  } catch (err: any) {
    // Refund remaining tokens on unexpected crash
    const remaining = tokenCost - tokensRefunded;
    if (remaining > 0) {
      try {
        await refundTokens({
          companyId,
          userId,
          amount: remaining,
          description: `Refund: longform job failed — ${err.message}`,
        });
      } catch (refundErr) {
        logger.error('[Longform] Refund on failure also failed', { error: String(refundErr) });
      }
    }
    throw err;
  } finally {
    // Cleanup temp directory
    try {
      await fs.rm(jobTempDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  }
}

/**
 * Start the longform video worker.
 */
export function startLongformWorker(): Worker<LongformJobData> | null {
  const connection = createRedisConnection();
  if (!connection) {
    console.warn('[Longform Worker] Redis not available, worker not started');
    return null;
  }

  const worker = new Worker<LongformJobData>('longform', processLongformJob, {
    connection: connection as any,
    concurrency: 1, // longform jobs are heavy — process one at a time
  });

  worker.on('completed', (job) => {
    logger.info(`[Longform Worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`[Longform Worker] Job ${job?.id} failed: ${err.message}`);
  });

  console.log('[Longform Worker] Started (concurrency: 1)');
  return worker;
}
