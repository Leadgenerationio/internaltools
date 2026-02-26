import { NextRequest, NextResponse } from 'next/server';
import { mkdir } from 'fs/promises';
import fs from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { getVideoInfo } from '@/lib/get-video-info';
import { logger } from '@/lib/logger';
import { getAuthContext } from '@/lib/api-auth';
import { trackVeoUsage } from '@/lib/track-usage';
import { checkTokenBalance } from '@/lib/check-limits';
import { deductTokens, refundTokens } from '@/lib/token-balance';
import { calculateVeoTokens } from '@/lib/token-pricing';
import { fileUrl } from '@/lib/file-url';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const maxDuration = 300; // 5 minutes — video generation can be slow

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_TIME_MS = 6 * 60 * 1000; // 6 minutes

export async function POST(request: NextRequest) {
  // Auth check
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { userId, companyId } = authResult.auth;

  logger.info('Generate-video API called');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.error('GEMINI_API_KEY is not set');
    return NextResponse.json(
      { error: 'GEMINI_API_KEY environment variable is not configured' },
      { status: 500 }
    );
  }

  // Declare tokenCost outside try so catch block can access it for refunds
  let tokenCost = 0;

  try {
    // Validate payload size
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

    const { prompt, count, aspectRatio, duration, includeSound } = body;

    // Validate inputs
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }
    const videoCount = Math.min(Math.max(Number(count) || 1, 1), 4);
    const validAspectRatios = ['9:16', '16:9'];
    const ar = validAspectRatios.includes(aspectRatio) ? aspectRatio : '9:16';
    const validDurations = ['4', '6', '8'];
    const dur = validDurations.includes(String(duration)) ? String(duration) : '6';

    logger.info('Generate request', { prompt: prompt.slice(0, 100), count: videoCount, aspectRatio: ar, duration: dur });

    // Check and deduct tokens (10 per AI video — includes future renders onto it)
    tokenCost = calculateVeoTokens(videoCount);
    const limitError = await checkTokenBalance(companyId, tokenCost);
    if (limitError) return limitError;

    const deduction = await deductTokens({
      companyId,
      userId,
      amount: tokenCost,
      reason: 'GENERATE_VIDEO',
      description: `Generate ${videoCount} AI video${videoCount !== 1 ? 's' : ''} (${tokenCost} tokens)`,
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

    // Ensure upload directory exists
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Fire parallel generation calls (with retry for transient errors)
    const MAX_RETRIES = 2;

    const generatePromises = Array.from({ length: videoCount }, async (_, i) => {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          const backoff = attempt * 5000; // 5s, 10s
          logger.info(`Retrying generation ${i + 1} (attempt ${attempt + 1}) after ${backoff}ms`);
          await new Promise((resolve) => setTimeout(resolve, backoff));
        }

        try {
          logger.info(`Starting generation ${i + 1}/${videoCount}${attempt > 0 ? ` (retry ${attempt})` : ''}`);

          let operation = await ai.models.generateVideos({
            model: 'veo-3.1-generate-preview',
            prompt: prompt.trim(),
            config: {
              aspectRatio: ar,
              durationSeconds: Number(dur),
              numberOfVideos: 1,
            },
          });

          // Poll until done
          const startTime = Date.now();
          while (!operation.done) {
            if (Date.now() - startTime > MAX_POLL_TIME_MS) {
              throw new Error(`Video generation ${i + 1} timed out after 6 minutes`);
            }
            logger.debug(`Polling generation ${i + 1}...`);
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
            operation = await ai.operations.getVideosOperation({ operation });
          }

          logger.info(`Generation ${i + 1} complete`);

          // Download the video
          const id = crypto.randomUUID();
          const filename = `${id}.mp4`;
          const filepath = path.join(UPLOAD_DIR, filename);

          const video = operation.response?.generatedVideos?.[0]?.video;
          if (!video) {
            throw new Error(`Generation ${i + 1} returned no video`);
          }

          await ai.files.download({ file: video, downloadPath: filepath });
          logger.info(`Downloaded video ${i + 1}`, { filepath });

          // Strip audio if user wants silent video
          if (!includeSound) {
            const silentPath = filepath.replace('.mp4', '_silent.mp4');
            try {
              await execFileAsync('ffmpeg', [
                '-y', '-i', filepath,
                '-c:v', 'copy', '-an',
                silentPath,
              ]);
              // Replace original with silent version
              fs.unlinkSync(filepath);
              fs.renameSync(silentPath, filepath);
              logger.info(`Stripped audio from video ${i + 1}`);
            } catch (e) {
              logger.warn('Failed to strip audio, keeping original', { error: String(e) });
              // Clean up if the silent file was created
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
          const isRetryable = /503|502|500|timeout|ECONNRESET|ETIMEDOUT|returned no video/i.test(err.message);
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

    // Refund tokens for failed videos (10 tokens each)
    if (failures.length > 0) {
      const refundAmount = calculateVeoTokens(failures.length);
      await refundTokens({
        companyId,
        userId,
        amount: refundAmount,
        description: `Refund: ${failures.length} AI video${failures.length !== 1 ? 's' : ''} failed to generate`,
      });
      logger.info(`Refunded ${refundAmount} tokens for ${failures.length} failed videos`);
    }

    if (videos.length === 0) {
      const firstError = (failures[0] as PromiseRejectedResult)?.reason?.message || 'All generations failed';
      return NextResponse.json({ error: firstError }, { status: 500 });
    }

    const tokensCharged = calculateVeoTokens(videos.length);

    // Track API cost (fire-and-forget)
    trackVeoUsage({
      companyId,
      userId,
      model: 'veo-3.1-generate-preview',
      videoCount: videos.length,
      videoSeconds: videos.length * Number(dur),
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

    // Refund all tokens on total failure
    await refundTokens({
      companyId,
      userId,
      amount: tokenCost,
      description: `Refund: video generation failed — ${error.message}`,
    });

    trackVeoUsage({
      companyId,
      userId,
      model: 'veo-3.1-generate-preview',
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
