/**
 * BullMQ worker for longform video generation jobs.
 *
 * Pipeline per variant:
 *   1. Generate voiceover (ElevenLabs)
 *   2. Generate b-roll clips (kie.ai) — optional, model selectable
 *   3. Normalize + stitch video (FFmpeg) — loops clips to match voiceover
 *
 * Captions are NOT added during initial generation — user edits scenes
 * in the editor first, then triggers reassembly which sends the final
 * video to Submagic for captioning.
 *
 * Also handles scene regeneration and reassembly jobs for the editor.
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
import { assembleAd, getMediaDuration, normalizeClip } from '@/lib/longform-stitcher';
import { generateVideoClip } from '@/lib/kie-api';
import { captionVideo } from '@/lib/submagic';
import type {
  LongformJobData, LongformJobResult,
  LongformSceneRegenData, LongformSceneRegenResult,
  LongformReassembleData, LongformReassembleResult,
} from '@/lib/job-types';
import type { LongformResultItem, LongformScene } from '@/lib/longform-types';

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'outputs');
const TEMP_BASE = path.join(process.cwd(), 'public', 'outputs', 'longform_temp');
const DEFAULT_BROLL_MODEL = 'veo3_fast';
const MAX_BROLL_CLIPS = 5; // more clips = better coverage of longer scripts

// ─── File upload helper (worker → S3 or web app) ────────────────────────────

async function uploadToApp(localPath: string, filename: string): Promise<void> {
  // Prefer S3 when configured — files get a public URL and are accessible everywhere
  try {
    const { isCloudStorage, uploadFile } = await import('@/lib/storage');
    if (isCloudStorage) {
      // Copy file before uploading because uploadFile deletes the local file,
      // but we may still need it for assembly later in the pipeline.
      const tmpCopy = localPath + '.s3upload.tmp';
      await fs.copyFile(localPath, tmpCopy);
      await uploadFile(tmpCopy, `outputs/${filename}`);
      return;
    }
  } catch {
    // storage module not available — fall through to internal upload
  }

  // Fallback: upload to web app's local filesystem via internal API
  const appUrl = process.env.APP_INTERNAL_URL || process.env.RAILWAY_SERVICE_INTERNALTOOLS_URL;
  const isWorkerMode = process.env.WORKER_MODE === 'true';

  if (isWorkerMode && appUrl && process.env.AUTH_SECRET) {
    const baseUrl = appUrl.startsWith('http') ? appUrl : `http://${appUrl}`;
    const uploadUrl = `${baseUrl}/api/internal/upload-output`;

    const fileBuffer = await fs.readFile(localPath);
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.AUTH_SECRET}`,
        'x-filename': filename,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(fileBuffer.length),
      },
      body: fileBuffer,
    });

    if (!uploadRes.ok) {
      const errBody = await uploadRes.text().catch(() => '');
      throw new Error(`Upload failed (${uploadRes.status}): ${errBody}`);
    }
  } else {
    // Local dev: copy to outputs
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.copyFile(localPath, path.join(OUTPUT_DIR, filename));
  }
}

// ─── Get a public URL for a local file (for Submagic) ───────────────────────

async function getPublicUrl(localPath: string): Promise<string | null> {
  try {
    const { uploadFile } = await import('@/lib/storage');
    const storagePath = `longform/${path.basename(localPath)}`;
    const publicUrl = await uploadFile(localPath, storagePath);
    return publicUrl || null;
  } catch {
    return null;
  }
}

// ─── Determine how many b-roll clips to generate based on script length ─────

function calculateClipCount(scriptText: string, modelDuration: number): number {
  // Estimate voiceover duration: ~150 words per minute at normal speed
  const wordCount = scriptText.split(/\s+/).filter(Boolean).length;
  const estimatedDurationSec = (wordCount / 150) * 60;

  // Calculate clips needed to fill the duration (with looping, we want at least good coverage)
  const clipsNeeded = Math.ceil(estimatedDurationSec / modelDuration);
  return Math.max(2, Math.min(clipsNeeded, MAX_BROLL_CLIPS));
}

// ─── Generate b-roll prompts from script if none provided ───────────────────

function generateBrollPrompts(script: { hook: string; body: string; cta: string }, count: number): string[] {
  const fullText = [script.hook, script.body, script.cta].filter(Boolean).join(' ');
  const sentences = fullText.split(/[.!?]+/).filter((s) => s.trim().length > 10);

  const prompts: string[] = [];
  for (let i = 0; i < count; i++) {
    const sentence = sentences[i % sentences.length]?.trim() || 'Professional person talking to camera, modern setting';
    prompts.push(`Cinematic b-roll scene: ${sentence}. Vertical video, high quality, smooth motion, natural lighting.`);
  }
  return prompts;
}

// ─── Main pipeline processor ────────────────────────────────────────────────

async function processLongformJob(job: Job<LongformJobData>): Promise<LongformJobResult> {
  const { companyId, userId, scripts, voiceConfig, captionConfig, skipBroll, videoModel, hookClipPath, tokenCost } = job.data;

  const results: LongformResultItem[] = [];
  const failures: string[] = [];
  let tokensRefunded = 0;

  const jobTempDir = path.join(TEMP_BASE, job.id || crypto.randomUUID());
  const brollModelId = videoModel || DEFAULT_BROLL_MODEL;

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
      const scriptText = [script.hook, script.body, script.cta].filter(Boolean).join('. ');

      try {
        // ── Stage 1: Voiceover (0-15% of variant) ─────────────────────
        await job.updateProgress(Math.round(baseProgress + variantWeight * 0.02));
        logger.info(`[Longform] Generating voiceover for [${variant}]`);

        const voicePaths = await generateScriptVoiceover(script, voiceConfig, variantDir);
        const voiceoverDuration = await getMediaDuration(voicePaths.fullAudio);
        await job.updateProgress(Math.round(baseProgress + variantWeight * 0.15));

        // ── Stage 2: B-roll (15-60% of variant) ──────────────────────
        const brollClips: string[] = [];
        const scenes: LongformScene[] = [];

        if (!skipBroll && kieApiKey) {
          logger.info(`[Longform] Generating b-roll for [${variant}] using model ${brollModelId}`);
          const brollDir = path.join(variantDir, 'broll');
          await fs.mkdir(brollDir, { recursive: true });

          // Determine clip count based on script length
          const { VIDEO_MODELS } = await import('@/lib/types');
          const model = VIDEO_MODELS.find((m) => m.id === brollModelId);
          const modelDuration = model?.duration || 8;
          const clipCount = calculateClipCount(scriptText, modelDuration);

          // Use provided prompts or generate from script
          const prompts = script.suggestedBroll.length > 0
            ? script.suggestedBroll.slice(0, clipCount)
            : generateBrollPrompts(script, clipCount);

          // Pad prompts if fewer than needed
          while (prompts.length < clipCount && script.suggestedBroll.length > 0) {
            prompts.push(script.suggestedBroll[prompts.length % script.suggestedBroll.length]);
          }

          for (let bi = 0; bi < prompts.length; bi++) {
            const clipPath = path.join(brollDir, `broll_${bi}.mp4`);
            const result = await generateVideoClip(kieApiKey, brollModelId, prompts[bi], '9:16', clipPath);

            if (result) {
              brollClips.push(result);

              // Upload individual scene clip
              const sceneFilename = `longform_scene_${variant}_${bi}_${crypto.randomUUID()}.mp4`;
              try {
                await uploadToApp(result, sceneFilename);
                const clipDuration = await getMediaDuration(result).catch(() => modelDuration);
                scenes.push({
                  order: bi,
                  prompt: prompts[bi],
                  clipUrl: fileUrl(`outputs/${sceneFilename}`),
                  clipFilename: sceneFilename,
                  durationSeconds: clipDuration,
                });
              } catch (err: any) {
                logger.warn(`[Longform] Scene upload failed for clip ${bi}`, { error: err.message });
              }
            }

            const brollProgress = 0.15 + (0.45 * (bi + 1)) / prompts.length;
            await job.updateProgress(Math.round(baseProgress + variantWeight * brollProgress));
          }
        } else if (kieApiKey && !skipBroll) {
          // Fallback: generate a single placeholder
          logger.info(`[Longform] Generating placeholder video for [${variant}]`);
          const placeholderPath = path.join(variantDir, 'placeholder.mp4');
          const result = await generateVideoClip(
            kieApiKey,
            brollModelId,
            'Professional person talking to camera, modern setting, vertical video, natural lighting, UGC style',
            '9:16',
            placeholderPath,
          );
          if (result) brollClips.push(result);
        }

        await job.updateProgress(Math.round(baseProgress + variantWeight * 0.60));

        if (brollClips.length === 0) {
          throw new Error(`All AI video models are currently unavailable. Please try again in a few minutes or select a different model.`);
        }

        // ── Stage 3: Stitch (60-75% of variant) ─────────────────────
        logger.info(`[Longform] Assembling video for [${variant}] (voiceover: ${voiceoverDuration.toFixed(1)}s)`);
        const stitchDir = path.join(variantDir, 'stitch');
        const rawVideoPath = path.join(variantDir, `raw_${variant}.mp4`);

        await assembleAd({
          hookClipPath: hookClipPath && existsSync(hookClipPath) ? hookClipPath : undefined,
          brollClips,
          voiceoverPath: voicePaths.fullAudio,
          outputPath: rawVideoPath,
          tempDir: stitchDir,
        });

        await job.updateProgress(Math.round(baseProgress + variantWeight * 0.90));

        // Captions are NOT applied here — user edits scenes first in the
        // editor, then triggers reassembly which sends to Submagic.
        const finalVideoPath = rawVideoPath;

        // ── Finalize: Upload final video + voiceover ─────────────────
        const outputId = crypto.randomUUID();
        const outputFilename = `longform_${variant}_${outputId}.mp4`;
        const voiceoverFilename = `longform_vo_${variant}_${outputId}.mp3`;

        const duration = await getMediaDuration(finalVideoPath).catch(() => 30);

        // Upload final video
        logger.info(`[Longform] Uploading ${outputFilename}`);
        await uploadToApp(finalVideoPath, outputFilename);

        // Upload voiceover for editor reassembly
        let voiceoverUrl: string | undefined;
        try {
          await uploadToApp(voicePaths.fullAudio, voiceoverFilename);
          voiceoverUrl = fileUrl(`outputs/${voiceoverFilename}`);
        } catch (err: any) {
          logger.warn(`[Longform] Voiceover upload failed`, { error: err.message });
        }

        results.push({
          variant: script.variant,
          videoUrl: fileUrl(`outputs/${outputFilename}`),
          captioned: false,
          durationSeconds: duration,
          voiceoverUrl,
          scenes: scenes.length > 0 ? scenes : undefined,
          scriptText,
        });

        await job.updateProgress(Math.round(baseProgress + variantWeight));
        logger.info(`[Longform] Variant [${variant}] complete (${duration.toFixed(1)}s)`);

      } catch (err: any) {
        logger.error(`[Longform] Variant [${variant}] failed`, { error: err.message });
        failures.push(`${variant}: ${err.message}`);
      }
    }

    // Refund tokens for failed variants
    if (failures.length > 0) {
      const refundAmount = calculateLongformTokens(failures.length, skipBroll, videoModel);
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

    const tokensUsed = calculateLongformTokens(results.length, skipBroll, videoModel);

    return {
      videos: results,
      failed: failures.length,
      tokensUsed,
      ...(failures.length > 0 && { warning: `${failures.length} of ${scripts.length} variants failed` }),
    };

  } catch (err: any) {
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
    try {
      await fs.rm(jobTempDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  }
}

// ─── Scene Regeneration ─────────────────────────────────────────────────────

async function processSceneRegen(job: Job<LongformSceneRegenData>): Promise<LongformSceneRegenResult> {
  const { companyId, userId, prompt, videoModel, tokenCost } = job.data;
  const tempDir = path.join(TEMP_BASE, `regen_${job.id || crypto.randomUUID()}`);

  try {
    const kieApiKey = process.env.KIE_API_KEY;
    if (!kieApiKey) throw new Error('KIE_API_KEY not configured');

    await fs.mkdir(tempDir, { recursive: true });
    await job.updateProgress(10);

    const clipPath = path.join(tempDir, 'clip.mp4');
    const result = await generateVideoClip(kieApiKey, videoModel, prompt, '9:16', clipPath);

    if (!result) throw new Error('Video clip generation failed');

    await job.updateProgress(70);

    // Normalize to standard format
    const normalizedPath = path.join(tempDir, 'normalized.mp4');
    await normalizeClip(clipPath, normalizedPath);

    const duration = await getMediaDuration(normalizedPath).catch(() => 8);
    const filename = `longform_scene_regen_${crypto.randomUUID()}.mp4`;

    await uploadToApp(normalizedPath, filename);
    await job.updateProgress(100);

    return {
      clipUrl: fileUrl(`outputs/${filename}`),
      clipFilename: filename,
      durationSeconds: duration,
      prompt,
      tokensUsed: tokenCost,
    };
  } catch (err: any) {
    // Refund tokens on failure
    try {
      await refundTokens({
        companyId,
        userId,
        amount: tokenCost,
        description: `Refund: scene regeneration failed — ${err.message}`,
      });
    } catch { /* ignore */ }
    throw err;
  } finally {
    try { await fs.rm(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// ─── Reassemble ─────────────────────────────────────────────────────────────

async function processReassemble(job: Job<LongformReassembleData>): Promise<LongformReassembleResult> {
  const { scenes, voiceoverUrl, captionConfig, scriptText } = job.data;
  const tempDir = path.join(TEMP_BASE, `reassemble_${job.id || crypto.randomUUID()}`);

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await job.updateProgress(5);

    // Download all scene clips and voiceover
    const clipPaths: string[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const clipPath = path.join(tempDir, `clip_${i}.mp4`);

      // Resolve URL: if it starts with / it's a local API route
      const url = scene.clipUrl.startsWith('/') ? `${getAppBaseUrl()}${scene.clipUrl}` : scene.clipUrl;
      logger.info(`[Longform] Downloading scene ${i}: ${url.slice(0, 120)}`);
      const res = await fetch(url, {
        headers: process.env.AUTH_SECRET ? { 'Authorization': `Bearer ${process.env.AUTH_SECRET}` } : {},
      });
      if (!res.ok) throw new Error(`Failed to download scene ${i}: ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());

      // Validate downloaded file is actually video (not HTML error page)
      if (buffer.length < 1000) {
        throw new Error(`Scene ${i} download too small (${buffer.length} bytes) — file may not exist`);
      }
      if (buffer.slice(0, 15).toString().includes('<html') || buffer.slice(0, 15).toString().includes('<!DOC')) {
        throw new Error(`Scene ${i} download returned HTML instead of video — auth or URL issue`);
      }

      await fs.writeFile(clipPath, buffer);
      clipPaths.push(clipPath);

      await job.updateProgress(5 + Math.round((i / scenes.length) * 30));
    }

    // Download voiceover
    const voPath = path.join(tempDir, 'voiceover.mp3');
    const voUrl = voiceoverUrl.startsWith('/') ? `${getAppBaseUrl()}${voiceoverUrl}` : voiceoverUrl;
    const voRes = await fetch(voUrl, {
      headers: process.env.AUTH_SECRET ? { 'Authorization': `Bearer ${process.env.AUTH_SECRET}` } : {},
    });
    if (!voRes.ok) throw new Error(`Failed to download voiceover: ${voRes.status}`);
    await fs.writeFile(voPath, Buffer.from(await voRes.arrayBuffer()));

    await job.updateProgress(40);

    // Assemble
    const rawPath = path.join(tempDir, 'assembled.mp4');
    const stitchDir = path.join(tempDir, 'stitch');
    await assembleAd({
      brollClips: clipPaths,
      voiceoverPath: voPath,
      outputPath: rawPath,
      tempDir: stitchDir,
    });

    await job.updateProgress(70);

    // Captions via Submagic
    let finalPath = rawPath;
    let captioned = false;

    if (captionConfig.enabled) {
      if (!process.env.SUBMAGIC_API_KEY) {
        throw new Error('Captions enabled but SUBMAGIC_API_KEY is not configured. Disable captions or contact admin.');
      }

      logger.info('[Longform] Uploading video for Submagic captioning...');
      const publicUrl = await getPublicUrl(rawPath);
      if (!publicUrl) {
        throw new Error('Captions require cloud storage (S3/R2) to generate a public URL. Configure S3_BUCKET, S3_REGION, and S3_ACCESS_KEY_ID environment variables.');
      }

      logger.info(`[Longform] Sending to Submagic (template: ${captionConfig.template})...`);
      const captionDir = path.join(tempDir, 'captions');
      await fs.mkdir(captionDir, { recursive: true });
      const captionedPath = path.join(captionDir, 'captioned.mp4');

      await captionVideo(publicUrl, captionedPath, captionConfig, 'Longform - Reassembled');
      finalPath = captionedPath;
      captioned = true;
      logger.info('[Longform] Submagic captioning complete');
    }

    await job.updateProgress(90);

    const duration = await getMediaDuration(finalPath).catch(() => 30);
    const filename = `longform_reassembled_${crypto.randomUUID()}.mp4`;
    await uploadToApp(finalPath, filename);

    await job.updateProgress(100);

    return {
      videoUrl: fileUrl(`outputs/${filename}`),
      durationSeconds: duration,
      captioned,
    };
  } finally {
    try { await fs.rm(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

function getAppBaseUrl(): string {
  const appUrl = process.env.APP_INTERNAL_URL || process.env.RAILWAY_SERVICE_INTERNALTOOLS_URL;
  if (appUrl) return appUrl.startsWith('http') ? appUrl : `http://${appUrl}`;
  return 'http://localhost:3000';
}

// ─── Worker entry point ─────────────────────────────────────────────────────

export function startLongformWorker(): Worker | null {
  const connection = createRedisConnection();
  if (!connection) {
    console.warn('[Longform Worker] Redis not available, worker not started');
    return null;
  }

  const worker = new Worker('longform', async (job) => {
    // Route based on job name
    if (job.name === 'longform-scene-regen') {
      return processSceneRegen(job as Job<LongformSceneRegenData>);
    }
    if (job.name === 'longform-reassemble') {
      return processReassemble(job as Job<LongformReassembleData>);
    }
    return processLongformJob(job as Job<LongformJobData>);
  }, {
    connection: connection as any,
    concurrency: 1,
  });

  worker.on('completed', (job) => {
    logger.info(`[Longform Worker] Job ${job.id} (${job.name}) completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`[Longform Worker] Job ${job?.id} (${job?.name}) failed: ${err.message}`);
  });

  console.log('[Longform Worker] Started (concurrency: 1)');
  return worker;
}
