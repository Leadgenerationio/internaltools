/**
 * kie.ai Image Generation API (Nano Banana 2).
 *
 * Submit image generation task -> poll for result -> download.
 * Used for avatar creation and product angle generation.
 */

import { logger } from '@/lib/logger';
import fs from 'fs/promises';
import path from 'path';

const KIE_API_BASE = 'https://api.kie.ai/api/v1';
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_TIME_MS = 3 * 60 * 1000; // 3 minutes

async function submitImageTask(
  apiKey: string,
  prompt: string,
  opts: {
    referenceImageUrls?: string[];
    aspectRatio?: string;
    resolution?: string;
  } = {},
): Promise<string> {
  const input: Record<string, any> = {
    prompt,
    aspect_ratio: opts.aspectRatio || '1:1',
    resolution: opts.resolution || '1K',
    output_format: 'png',
  };

  if (opts.referenceImageUrls?.length) {
    input.image_input = opts.referenceImageUrls;
  }

  const res = await fetch(`${KIE_API_BASE}/jobs/createTask`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'nano-banana-2', input }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`kie.ai image submit failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const taskId = data.data?.taskId || data.taskId;
  if (!taskId) throw new Error('kie.ai returned no taskId');
  return taskId;
}

async function pollTaskResult(apiKey: string, taskId: string): Promise<string[]> {
  const start = Date.now();

  while (Date.now() - start < MAX_POLL_TIME_MS) {
    const res = await fetch(`${KIE_API_BASE}/jobs/recordInfo?taskId=${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (res.ok) {
      const data = await res.json();
      const task = data.data || data;

      if (task.state === 'success' && task.resultJson) {
        const result = typeof task.resultJson === 'string' ? JSON.parse(task.resultJson) : task.resultJson;
        return result.resultUrls || [];
      }

      if (task.state === 'fail') {
        throw new Error(`Image generation failed: ${task.failMsg || 'Unknown error'}`);
      }
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error('Image generation timed out');
}

async function downloadImage(url: string, outputPath: string): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image download failed (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(outputPath, buffer);
}

/**
 * Generate an avatar image using Nano Banana 2.
 * Returns the local path to the downloaded PNG.
 */
export async function generateAvatarImage(
  apiKey: string,
  prompt: string,
  outputPath: string,
  referenceImageUrls?: string[],
): Promise<string> {
  logger.info('[kie-image] Generating avatar image...');
  const taskId = await submitImageTask(apiKey, prompt, { referenceImageUrls, aspectRatio: '1:1' });
  logger.info(`[kie-image] Task submitted: ${taskId}`);

  const urls = await pollTaskResult(apiKey, taskId);
  if (!urls.length) throw new Error('No image URLs in result');

  await downloadImage(urls[0], outputPath);
  logger.info(`[kie-image] Avatar image saved: ${outputPath}`);
  return outputPath;
}

/**
 * Generate product angle images.
 * Returns array of local paths to downloaded PNGs.
 */
export async function generateProductAngles(
  apiKey: string,
  productImageUrl: string,
  outputDir: string,
): Promise<Array<{ path: string; label: string }>> {
  const angles = [
    'front view, straight on, product photography, white background',
    'front-left angle, 30 degrees, product photography, white background',
    'front-right angle, 30 degrees, product photography, white background',
    'left side view, 90 degrees, product photography, white background',
    'right side view, 90 degrees, product photography, white background',
    'top-down view, overhead, product photography, white background',
    'back view, rear, product photography, white background',
    'close-up detail shot, product photography, white background',
    'lifestyle shot, product in use, natural setting',
  ];

  await fs.mkdir(outputDir, { recursive: true });
  const results: Array<{ path: string; label: string }> = [];

  const outcomes = await Promise.allSettled(
    angles.map(async (anglePrompt, i) => {
      const label = anglePrompt.split(',')[0];
      const outPath = path.join(outputDir, `angle_${i}.png`);
      const fullPrompt = `${anglePrompt}, same product as reference image, high quality, professional`;
      const taskId = await submitImageTask(apiKey, fullPrompt, {
        referenceImageUrls: [productImageUrl],
        aspectRatio: '1:1',
      });
      const urls = await pollTaskResult(apiKey, taskId);
      if (urls.length) {
        await downloadImage(urls[0], outPath);
        return { path: outPath, label };
      }
      throw new Error('No URL returned');
    }),
  );

  for (const outcome of outcomes) {
    if (outcome.status === 'fulfilled') {
      results.push(outcome.value);
    }
  }

  if (results.length === 0) {
    throw new Error('All product angle generations failed');
  }

  return results;
}
