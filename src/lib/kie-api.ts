/**
 * Shared kie.ai API helpers for video generation.
 *
 * Supports two API patterns:
 * - Veo API (/veo/) for veo3_fast, veo3
 * - Market API (/jobs/) for seedance, kling, sora
 *
 * Used by both video-gen-worker and longform-worker.
 */

import { logger } from '@/lib/logger';
import { VIDEO_MODELS } from '@/lib/types';
import type { VideoModel } from '@/lib/types';
import fs from 'fs/promises';
import path from 'path';

const KIE_API_BASE = 'https://api.kie.ai/api/v1';
const POLL_INTERVAL_MS = 15_000;
const MAX_POLL_TIME_MS = 10 * 60 * 1000; // 10 minutes

// ─── Rate limit throttle ─────────────────────────────────────────────────────
// kie.ai allows 20 requests per 10 seconds. We track submission timestamps
// and wait if we'd exceed the limit.
const RATE_WINDOW_MS = 10_000;
const MAX_REQUESTS_PER_WINDOW = 18; // leave 2 buffer for polling
const submitTimestamps: number[] = [];

async function throttleSubmit(): Promise<void> {
  const now = Date.now();
  // Remove timestamps outside the window
  while (submitTimestamps.length > 0 && submitTimestamps[0] < now - RATE_WINDOW_MS) {
    submitTimestamps.shift();
  }
  if (submitTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const waitUntil = submitTimestamps[0] + RATE_WINDOW_MS;
    const delay = waitUntil - now + 500; // +500ms safety buffer
    logger.info(`[kie-api] Throttling: waiting ${(delay / 1000).toFixed(1)}s to avoid rate limit`);
    await new Promise((r) => setTimeout(r, delay));
  }
  submitTimestamps.push(Date.now());
}

// ─── Market API ──────────────────────────────────────────────────────────────

export function buildMarketInput(
  model: VideoModel,
  prompt: string,
  aspectRatio: string,
  includeSound: boolean,
): Record<string, any> {
  if (model.id.startsWith('sora-2')) {
    const input: Record<string, any> = {
      prompt,
      aspect_ratio: aspectRatio === '9:16' ? 'portrait' : 'landscape',
      n_frames: String(model.duration),
      remove_watermark: true,
      upload_method: 's3',
    };
    if (model.id.includes('pro')) input.size = 'high';
    return input;
  }

  if (model.id.startsWith('kling')) {
    return {
      prompt,
      sound: includeSound,
      aspect_ratio: aspectRatio,
      duration: String(model.duration),
    };
  }

  if (model.id.includes('seedance')) {
    return {
      prompt,
      aspect_ratio: aspectRatio,
      resolution: '720p',
      duration: String(model.duration),
      fixed_lens: false,
      generate_audio: includeSound,
    };
  }

  throw new Error(`Unknown market model: ${model.id}`);
}

export async function submitAndPollMarket(
  apiKey: string,
  model: VideoModel,
  prompt: string,
  aspectRatio: string,
  includeSound: boolean,
): Promise<string[]> {
  await throttleSubmit();
  const submitRes = await fetch(`${KIE_API_BASE}/jobs/createTask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model.id,
      input: buildMarketInput(model, prompt, aspectRatio, includeSound),
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

  const startTime = Date.now();
  while (Date.now() - startTime < MAX_POLL_TIME_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(`${KIE_API_BASE}/jobs/recordInfo?taskId=${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
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

// ─── Veo API ─────────────────────────────────────────────────────────────────

export async function submitAndPollVeo(
  apiKey: string,
  modelId: string,
  prompt: string,
  aspectRatio: string,
): Promise<string[]> {
  await throttleSubmit();
  const submitRes = await fetch(`${KIE_API_BASE}/veo/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt: prompt.trim(),
      model: modelId,
      aspect_ratio: aspectRatio,
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

  const startTime = Date.now();
  while (Date.now() - startTime < MAX_POLL_TIME_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(`${KIE_API_BASE}/veo/record-info?taskId=${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
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

// ─── Fallback model order ───────────────────────────────────────────────────

const FALLBACK_MODELS = ['veo3_fast', 'bytedance/seedance-1.5-pro', 'kling-2.6/text-to-video'];

function isRetriableError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('heavy load') || lower.includes('not responding')
    || lower.includes('capacity') || lower.includes('overloaded')
    || lower.includes('temporarily unavailable') || lower.includes('service busy')
    || lower.includes('rate limited') || lower.includes('429');
}

// ─── Single-model clip generation ───────────────────────────────────────────

async function generateClipWithModel(
  apiKey: string,
  model: VideoModel,
  prompt: string,
  aspectRatio: string,
  outputPath: string,
): Promise<string> {
  let resultUrls: string[];

  if (model.apiType === 'veo') {
    resultUrls = await submitAndPollVeo(apiKey, model.id, prompt, aspectRatio);
  } else {
    resultUrls = await submitAndPollMarket(apiKey, model, prompt, aspectRatio, model.supportsSound);
  }

  if (resultUrls.length === 0) {
    throw new Error(`${model.label}: no video URLs returned`);
  }

  const dlRes = await fetch(resultUrls[0]);
  if (!dlRes.ok) {
    throw new Error(`${model.label}: download failed (${dlRes.status})`);
  }

  const buffer = Buffer.from(await dlRes.arrayBuffer());
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, buffer);

  return outputPath;
}

// ─── Unified clip generator with automatic fallback ─────────────────────────

/**
 * Generate a single video clip and download it to outputPath.
 * Works with any kie.ai model (Veo or Market pattern).
 * If the chosen model fails with a capacity/overload error, automatically
 * falls back to alternative models (veo3_fast → seedance → kling).
 * Returns the output path on success, null on failure.
 */
export async function generateVideoClip(
  apiKey: string,
  modelId: string,
  prompt: string,
  aspectRatio: string,
  outputPath: string,
): Promise<string | null> {
  const model = VIDEO_MODELS.find((m) => m.id === modelId);
  if (!model) {
    logger.warn(`[kie-api] Unknown model: ${modelId}`);
    return null;
  }

  // Try the requested model first (with one retry on rate limit)
  try {
    return await generateClipWithModel(apiKey, model, prompt, aspectRatio, outputPath);
  } catch (err: any) {
    logger.warn(`[kie-api] Primary model failed`, { model: modelId, error: err.message });

    // On rate limit, wait and retry the same model once
    if (err.message.includes('Rate limited') || err.message.includes('429')) {
      logger.info(`[kie-api] Rate limited — waiting 12s before retry`);
      await new Promise((r) => setTimeout(r, 12_000));
      try {
        return await generateClipWithModel(apiKey, model, prompt, aspectRatio, outputPath);
      } catch (retryErr: any) {
        logger.warn(`[kie-api] Retry after rate limit also failed`, { error: retryErr.message });
      }
    }

    // Only try fallbacks for retriable errors (capacity, overload, rate limit)
    if (!isRetriableError(err.message)) {
      return null;
    }
  }

  // Try fallback models (with delay between attempts)
  for (const fallbackId of FALLBACK_MODELS) {
    if (fallbackId === modelId) continue; // skip the one we already tried

    const fallback = VIDEO_MODELS.find((m) => m.id === fallbackId);
    if (!fallback) continue;

    // Brief delay before trying next model to avoid rate limit cascade
    await new Promise((r) => setTimeout(r, 2_000));

    logger.info(`[kie-api] Trying fallback model: ${fallback.label}`);
    try {
      const result = await generateClipWithModel(apiKey, fallback, prompt, aspectRatio, outputPath);
      logger.info(`[kie-api] Fallback ${fallback.label} succeeded`);
      return result;
    } catch (fbErr: any) {
      logger.warn(`[kie-api] Fallback ${fallback.label} also failed`, { error: fbErr.message });
    }
  }

  logger.error(`[kie-api] All models failed for prompt: ${prompt.slice(0, 60)}`);
  return null;
}
