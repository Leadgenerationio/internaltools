import { NextRequest, NextResponse } from 'next/server';
import { mkdir } from 'fs/promises';
import fs from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getVideoInfo } from '@/lib/get-video-info';
import { logger } from '@/lib/logger';
import { getAuthContext } from '@/lib/api-auth';
import { trackVeoUsage } from '@/lib/track-usage';
import { checkTokenBalance } from '@/lib/check-limits';
import { deductTokens, refundTokens } from '@/lib/token-balance';
import { calculateVeoTokens } from '@/lib/token-pricing';
import { fileUrl } from '@/lib/file-url';
import { VIDEO_MODELS } from '@/lib/types';
import type { VideoModel } from '@/lib/types';
import { getVideoGenQueue } from '@/lib/queue';
import type { VideoGenJobData } from '@/lib/job-types';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const maxDuration = 300; // 5 minutes — video generation can be slow

const KIE_API_BASE = 'https://api.kie.ai/api/v1';
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_TIME_MS = 4 * 60 * 1000; // 4 minutes (under maxDuration for clean error)
const MAX_RETRIES = 2;

// ── Market API helpers (Kling, Sora) ──

function buildMarketInput(model: VideoModel, prompt: string, ar: string, includeSound: boolean): Record<string, any> {
  const modelId = model.id;

  // Sora models — uses portrait/landscape, n_frames for duration
  if (modelId.startsWith('sora-2')) {
    const input: Record<string, any> = {
      prompt,
      aspect_ratio: ar === '9:16' ? 'portrait' : 'landscape',
      n_frames: String(model.duration),
      remove_watermark: true,
      upload_method: 's3',
    };
    // Sora 2 Pro requires size: 'high'
    if (modelId.includes('pro')) {
      input.size = 'high';
    }
    return input;
  }

  // Kling models — uses 9:16/16:9/1:1, duration string, sound boolean
  if (modelId.startsWith('kling')) {
    return {
      prompt,
      sound: includeSound,
      aspect_ratio: ar,
      duration: String(model.duration),
    };
  }

  // Seedance — uses resolution, duration, generate_audio
  if (modelId.includes('seedance')) {
    return {
      prompt,
      aspect_ratio: ar,
      resolution: '720p',
      duration: String(model.duration),
      fixed_lens: false,
      generate_audio: includeSound,
    };
  }

  throw new Error(`Unknown market model: ${modelId}`);
}

async function submitMarketJob(apiKey: string, model: VideoModel, prompt: string, ar: string, includeSound: boolean): Promise<string> {
  const res = await fetch(`${KIE_API_BASE}/jobs/createTask`, {
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

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    if (res.status === 429) throw new Error('Rate limited by kie.ai (429)');
    if (res.status === 402) throw new Error('Insufficient kie.ai credits — top up at kie.ai');
    throw new Error(`kie.ai submit failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const taskId = data?.data?.taskId;
  if (!taskId) throw new Error(`kie.ai returned no taskId: ${JSON.stringify(data)}`);
  return taskId;
}

async function pollMarketJob(apiKey: string, taskId: string): Promise<string[]> {
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_POLL_TIME_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const res = await fetch(
      `${KIE_API_BASE}/jobs/recordInfo?taskId=${taskId}`,
      { headers: { 'Authorization': `Bearer ${apiKey}` } }
    );

    if (!res.ok) {
      logger.warn(`Market poll failed (${res.status}), retrying...`);
      continue;
    }

    const pollData = await res.json();
    const state = pollData?.data?.state;

    if (state === 'success') {
      // resultJson is a JSON string containing { resultUrls: [...] }
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

    // waiting, queuing, generating — continue polling
  }

  return []; // timed out
}

// ── Veo API helpers ──

async function submitVeoJob(apiKey: string, modelId: string, prompt: string, ar: string): Promise<string> {
  const res = await fetch(`${KIE_API_BASE}/veo/generate`, {
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

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    if (res.status === 429) throw new Error('Rate limited by kie.ai (429)');
    if (res.status === 402) throw new Error('Insufficient kie.ai credits — top up at kie.ai');
    throw new Error(`kie.ai submit failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const taskId = data?.data?.taskId;
  if (!taskId) throw new Error(`kie.ai returned no taskId: ${JSON.stringify(data)}`);
  return taskId;
}

async function pollVeoJob(apiKey: string, taskId: string): Promise<string[]> {
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_POLL_TIME_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const res = await fetch(
      `${KIE_API_BASE}/veo/record-info?taskId=${taskId}`,
      { headers: { 'Authorization': `Bearer ${apiKey}` } }
    );

    if (!res.ok) {
      logger.warn(`Veo poll failed (${res.status}), retrying...`);
      continue;
    }

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

    // flag === 0 — still generating
  }

  return []; // timed out
}

// ── Main route handler ──

export async function POST(request: NextRequest) {
  // Auth check
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { userId, companyId } = authResult.auth;

  logger.info('Generate-video API called');

  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    logger.error('KIE_API_KEY is not set');
    return NextResponse.json(
      { error: 'KIE_API_KEY environment variable is not configured' },
      { status: 500 }
    );
  }

  let tokenCost = 0;
  let tokensRefunded = 0;
  let selectedModelId = 'sora-2-text-to-video';

  try {
    const rawBody = await request.text();
    if (rawBody.length > 10_000) {
      return NextResponse.json({ error: 'Request payload too large' }, { status: 413 });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { prompt, count, aspectRatio, model, includeSound } = body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }
    const videoCount = Math.min(Math.max(Number(count) || 1, 1), 4);

    // Validate model
    const validModel = VIDEO_MODELS.find((m) => m.id === model);
    if (!validModel) {
      return NextResponse.json({ error: `Invalid model: ${model}` }, { status: 400 });
    }
    selectedModelId = validModel.id;
    const videoDuration = validModel.duration;

    // Validate aspect ratio against model's supported ratios
    const ar = validModel.aspectRatios.includes(aspectRatio) ? aspectRatio : validModel.aspectRatios[0];

    logger.info('Generate request', {
      prompt: prompt.slice(0, 100),
      count: videoCount,
      aspectRatio: ar,
      model: selectedModelId,
      apiType: validModel.apiType,
    });

    // Check and deduct tokens (per-model pricing)
    tokenCost = calculateVeoTokens(videoCount, selectedModelId);
    const limitError = await checkTokenBalance(companyId, tokenCost);
    if (limitError) return limitError;

    const deduction = await deductTokens({
      companyId,
      userId,
      amount: tokenCost,
      reason: 'GENERATE_VIDEO',
      description: `Generate ${videoCount}× ${validModel.label} (${tokenCost} tokens)`,
    });

    if (!deduction.success) {
      return NextResponse.json(
        {
          error: `You need ${tokenCost} tokens but have ${deduction.balance}. Top up or upgrade your plan.`,
          code: 'INSUFFICIENT_TOKENS',
          balance: deduction.balance,
          required: tokenCost,
        },
        { status: 402 }
      );
    }

    // Try to enqueue as background job (returns immediately)
    const queue = getVideoGenQueue();
    if (queue) {
      const jobData: VideoGenJobData = {
        companyId,
        userId,
        prompt: prompt.trim(),
        count: videoCount,
        aspectRatio: ar as '9:16' | '16:9' | '1:1',
        model: selectedModelId,
        includeSound: !!includeSound,
        apiType: validModel.apiType,
        tokenCost,
      };

      const job = await queue.add('video-gen', jobData, {
        attempts: 1,
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 3600 },
      });

      return NextResponse.json({
        jobId: job.id,
        type: 'video-gen' as const,
        message: 'Video generation job queued',
      });
    }

    // Fallback: synchronous generation (no Redis available)

    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    // Fire parallel generation calls (with retry for transient errors)
    const generatePromises = Array.from({ length: videoCount }, async (_, i) => {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          const backoff = attempt * 5000;
          logger.info(`Retrying generation ${i + 1} (attempt ${attempt + 1}) after ${backoff}ms`);
          await new Promise((resolve) => setTimeout(resolve, backoff));
        }

        try {
          logger.info(`Starting generation ${i + 1}/${videoCount}${attempt > 0 ? ` (retry ${attempt})` : ''}`);

          // ── Submit + Poll (branched by API type) ──
          let resultUrls: string[];

          if (validModel.apiType === 'market') {
            const taskId = await submitMarketJob(apiKey, validModel, prompt.trim(), ar, !!includeSound);
            logger.info(`Generation ${i + 1} submitted (market)`, { taskId });
            resultUrls = await pollMarketJob(apiKey, taskId);
          } else {
            const taskId = await submitVeoJob(apiKey, selectedModelId, prompt.trim(), ar);
            logger.info(`Generation ${i + 1} submitted (veo)`, { taskId });
            resultUrls = await pollVeoJob(apiKey, taskId);
          }

          if (resultUrls.length === 0) {
            throw new Error(`Video generation ${i + 1} timed out after 4 minutes`);
          }

          logger.info(`Generation ${i + 1} complete`);

          // ── Download the video ──
          const id = crypto.randomUUID();
          const filename = `${id}.mp4`;
          const filepath = path.join(UPLOAD_DIR, filename);

          const videoUrl = resultUrls[0];
          const downloadRes = await fetch(videoUrl);
          if (!downloadRes.ok) {
            throw new Error(`Video download failed (${downloadRes.status}) from ${videoUrl}`);
          }
          const buffer = Buffer.from(await downloadRes.arrayBuffer());
          fs.writeFileSync(filepath, buffer);
          logger.info(`Downloaded video ${i + 1}`, { filepath, bytes: buffer.length });

          // Strip audio if user wants silent video (only for models that have audio)
          if (!includeSound && validModel.supportsSound) {
            const silentPath = filepath.replace('.mp4', '_silent.mp4');
            try {
              await execFileAsync('ffmpeg', [
                '-y', '-i', filepath,
                '-c:v', 'copy', '-an',
                silentPath,
              ]);
              fs.unlinkSync(filepath);
              fs.renameSync(silentPath, filepath);
              logger.info(`Stripped audio from video ${i + 1}`);
            } catch (e) {
              logger.warn('Failed to strip audio, keeping original', { error: String(e) });
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
          } catch (e) {
            logger.warn('Thumbnail generation failed for generated video', { error: String(e) });
          }

          return {
            id,
            filename,
            originalName: `AI Generated ${i + 1}`,
            path: fileUrl(`uploads/${filename}`),
            duration: info.duration,
            width: info.width,
            height: info.height,
            thumbnail: fileUrl(`uploads/${thumbFilename}`),
          };
        } catch (err: any) {
          lastError = err;
          const isRetryable = /503|502|500|429|timeout|ECONNRESET|ETIMEDOUT/i.test(err.message);
          if (!isRetryable || attempt >= MAX_RETRIES) {
            throw err;
          }
          logger.warn(`Generation ${i + 1} failed (retryable)`, { error: err.message, attempt });
        }
      }
      throw lastError || new Error(`Generation ${i + 1} failed after ${MAX_RETRIES + 1} attempts`);
    });

    const results = await Promise.allSettled(generatePromises);

    const videos = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map((r) => r.value);

    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      logger.warn('Some generations failed', {
        succeeded: videos.length,
        failed: failures.length,
        errors: failures.map((f) => (f as PromiseRejectedResult).reason?.message),
      });
    }

    // Refund tokens for failed videos
    if (failures.length > 0) {
      const refundAmount = calculateVeoTokens(failures.length, selectedModelId);
      await refundTokens({
        companyId,
        userId,
        amount: refundAmount,
        description: `Refund: ${failures.length} AI video${failures.length !== 1 ? 's' : ''} failed to generate`,
      });
      tokensRefunded = refundAmount;
      logger.info(`Refunded ${refundAmount} tokens for ${failures.length} failed videos`);
    }

    if (videos.length === 0) {
      const firstError = (failures[0] as PromiseRejectedResult)?.reason?.message || 'All generations failed';
      return NextResponse.json({ error: firstError }, { status: 500 });
    }

    const tokensCharged = calculateVeoTokens(videos.length, selectedModelId);

    // Track API cost (fire-and-forget)
    trackVeoUsage({
      companyId,
      userId,
      model: selectedModelId,
      videoCount: videos.length,
      videoSeconds: videos.length * videoDuration,
      endpoint: 'generate-video',
      durationMs: 0,
      success: true,
      tokensCost: tokensCharged,
    });

    logger.info('Generations complete', { succeeded: videos.length, failed: failures.length, tokensCharged });
    return NextResponse.json({
      videos,
      tokensUsed: tokensCharged,
      ...(failures.length > 0 && { warning: `${failures.length} of ${videoCount} videos failed to generate` }),
    });
  } catch (error: any) {
    logger.error('Generate-video error', { error: error.message, stack: error.stack });

    // Refund remaining tokens on total failure (subtract any partial refunds already issued)
    const remainingRefund = tokenCost - tokensRefunded;
    if (remainingRefund > 0) {
      await refundTokens({
        companyId,
        userId,
        amount: remainingRefund,
        description: `Refund: video generation failed — ${error.message}`,
      });
    }

    trackVeoUsage({
      companyId,
      userId,
      model: selectedModelId,
      videoCount: 0,
      endpoint: 'generate-video',
      durationMs: 0,
      success: false,
      errorMessage: error.message,
      tokensCost: 0,
    });

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
