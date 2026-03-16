/**
 * POST /api/longform/finalize
 *
 * Enqueues a BullMQ background job to assemble final longform videos.
 * Returns { jobId } immediately — client polls /api/jobs/[id]?type=longform.
 *
 * Assembly is FREE — all costs (voiceover, scene generation) already paid incrementally.
 *
 * Falls back to synchronous processing when Redis/BullMQ is unavailable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { getLongformQueue, isQueueAvailable } from '@/lib/queue';
import type { LongformFinalizeData } from '@/lib/job-types';
import type { CaptionConfig, LongformResultItem } from '@/lib/longform-types';

export const maxDuration = 300; // 5 minutes for sync fallback

interface RequestBody {
  variants: Array<{
    scriptId: string;
    variant: string;
    voiceoverUrl: string;
    scenes: Array<{ clipUrl: string; order: number }>;
  }>;
  music: { url: string; volume: number } | null;
  captionConfig: CaptionConfig;
  aspectRatio: '9:16' | '16:9' | '1:1';
}

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;

  const body: RequestBody = await request.json();
  const { variants, music, captionConfig, aspectRatio } = body;

  if (!variants?.length) {
    return NextResponse.json({ error: 'At least one variant is required' }, { status: 400 });
  }

  for (const v of variants) {
    if (!v.voiceoverUrl) {
      return NextResponse.json({ error: `Variant "${v.variant}" is missing voiceover` }, { status: 400 });
    }
    if (!v.scenes?.length) {
      return NextResponse.json({ error: `Variant "${v.variant}" has no scenes` }, { status: 400 });
    }
    for (const s of v.scenes) {
      if (!s.clipUrl) {
        return NextResponse.json({ error: `Variant "${v.variant}" has an empty scene slot` }, { status: 400 });
      }
    }
  }

  if (captionConfig?.enabled && !process.env.SUBMAGIC_API_KEY) {
    return NextResponse.json({
      error: 'Captions enabled but SUBMAGIC_API_KEY is not configured',
    }, { status: 503 });
  }

  // ─── Background job path (preferred) ──────────────────────────────────────

  const queue = getLongformQueue();
  if (queue) {
    const jobData: LongformFinalizeData = {
      companyId: authResult.auth.companyId,
      userId: authResult.auth.userId,
      variants,
      music,
      captionConfig,
      aspectRatio,
    };

    const job = await queue.add('longform-finalize', jobData, {
      attempts: 1, // no retries for finalize (FFmpeg is idempotent but files may be gone)
      removeOnComplete: { age: 3600 }, // keep result for 1 hour
      removeOnFail: { age: 3600 },
    });

    return NextResponse.json({ jobId: job.id });
  }

  // ─── Synchronous fallback (no Redis) ──────────────────────────────────────

  const path = await import('path');
  const fs = await import('fs/promises');
  const crypto = await import('crypto');
  const { assembleAdV2, getMediaDuration } = await import('@/lib/longform-stitcher');
  const { captionVideo } = await import('@/lib/submagic');
  const { fileUrl } = await import('@/lib/file-url');

  const OUTPUT_DIR = path.join(process.cwd(), 'public', 'outputs');
  const TEMP_BASE = path.join(process.cwd(), 'public', 'outputs', 'longform_temp');
  const tempDir = path.join(TEMP_BASE, `finalize_${crypto.randomUUID()}`);

  // 4-minute timeout for sync path
  const GLOBAL_TIMEOUT_MS = 4 * 60 * 1000;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Finalize timed out after 4 minutes')), GLOBAL_TIMEOUT_MS)
  );

  const processVariants = async () => {
    const results: LongformResultItem[] = [];
    const failures: string[] = [];

    await fs.mkdir(tempDir, { recursive: true });

    for (let vi = 0; vi < variants.length; vi++) {
      const v = variants[vi];
      const variantDir = path.join(tempDir, `v_${vi}`);
      await fs.mkdir(variantDir, { recursive: true });

      try {
        // Download voiceover
        const voPath = path.join(variantDir, 'voiceover.mp3');
        const voBuffer = await downloadFile(v.voiceoverUrl, `Voiceover (${v.variant})`);
        await fs.writeFile(voPath, voBuffer);

        // Download scene clips
        const sortedScenes = [...v.scenes].sort((a, b) => a.order - b.order);
        const clipPaths: string[] = [];
        for (let si = 0; si < sortedScenes.length; si++) {
          const scene = sortedScenes[si];
          const clipPath = path.join(variantDir, `clip_${si}.mp4`);
          const buffer = await downloadFile(scene.clipUrl, `Scene ${si + 1} (${v.variant})`);
          if (buffer.length < 1000) {
            throw new Error(`Scene ${si + 1} download too small (${buffer.length} bytes)`);
          }
          await fs.writeFile(clipPath, buffer);
          clipPaths.push(clipPath);
        }

        // Download music
        let musicPath: string | undefined;
        if (music?.url) {
          const mPath = path.join(variantDir, 'music.mp3');
          const musicBuffer = await downloadFile(music.url, `Music (${v.variant})`);
          await fs.writeFile(mPath, musicBuffer);
          musicPath = mPath;
        }

        // Assemble
        const rawPath = path.join(variantDir, 'assembled.mp4');
        const stitchDir = path.join(variantDir, 'stitch');
        await assembleAdV2({
          clips: clipPaths,
          voiceoverPath: voPath,
          outputPath: rawPath,
          tempDir: stitchDir,
          aspectRatio: aspectRatio || '9:16',
          musicPath,
          musicVolume: music?.volume ?? 0.15,
        });

        // Captions
        let finalPath = rawPath;
        let captioned = false;
        if (captionConfig?.enabled && process.env.SUBMAGIC_API_KEY) {
          const publicUrl = await getPublicUrl(rawPath);
          if (publicUrl) {
            const captionDir = path.join(variantDir, 'captions');
            await fs.mkdir(captionDir, { recursive: true });
            const captionedPath = path.join(captionDir, 'captioned.mp4');
            await captionVideo(publicUrl, captionedPath, captionConfig, `Longform - ${v.variant}`);
            finalPath = captionedPath;
            captioned = true;
          }
        }

        // Upload
        const duration = await getMediaDuration(finalPath).catch(() => 30);
        const outputFilename = `longform_final_${v.variant.replace(/[^a-zA-Z0-9_-]/g, '_')}_${crypto.randomUUID()}.mp4`;
        await uploadOutput(finalPath, outputFilename, OUTPUT_DIR);

        results.push({
          variant: v.variant,
          videoUrl: fileUrl(`outputs/${outputFilename}`),
          captioned,
          durationSeconds: duration,
          voiceoverUrl: v.voiceoverUrl,
        });
      } catch (err: any) {
        failures.push(`${v.variant}: ${err.message}`);
      }
    }

    if (results.length === 0) {
      throw new Error(failures[0] || 'All variants failed to finalize');
    }

    return {
      videos: results,
      failed: failures.length,
      ...(failures.length > 0 && { warning: `${failures.length} of ${variants.length} variants failed` }),
    };
  };

  try {
    const result = await Promise.race([processVariants(), timeoutPromise]);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Finalize failed' }, { status: 500 });
  } finally {
    try { await fs.rm(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// ─── Sync fallback helpers (only used when Redis unavailable) ─────────────

function resolveLocalPath(url: string): string | null {
  const path = require('path');
  if (url.includes('/api/files')) {
    const match = url.match(/[?&]path=([^&]+)/);
    if (match) {
      return path.join(process.cwd(), 'public', decodeURIComponent(match[1]));
    }
  }
  if (url.startsWith('/') && !url.startsWith('//')) {
    return path.join(process.cwd(), 'public', url);
  }
  return null;
}

function extractStoragePath(url: string): string | null {
  if (url.includes('/api/files')) {
    const match = url.match(/[?&]path=([^&]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  const bucketName = process.env.S3_BUCKET;
  if (bucketName) {
    const pattern = `/object/public/${bucketName}/`;
    const idx = url.indexOf(pattern);
    if (idx >= 0) return url.slice(idx + pattern.length);
  }
  const match = url.match(/(outputs\/[^\s?#]+|longform\/[^\s?#]+|uploads\/[^\s?#]+)/);
  if (match) return match[1];
  return null;
}

async function fetchWithTimeout(fetchUrl: string, opts: RequestInit = {}, timeoutMs = 30_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(fetchUrl, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function downloadFile(url: string, label: string): Promise<Buffer> {
  const path = require('path');
  const fs = require('fs/promises');
  const errors: string[] = [];

  const localPath = resolveLocalPath(url);
  if (localPath) {
    try {
      const buf = await fs.readFile(localPath);
      if (buf.length > 100) return buf;
      errors.push(`local: file too small (${buf.length}b)`);
    } catch (e: any) {
      errors.push(`local: ${e.code || e.message}`);
    }
  }

  const storagePath = extractStoragePath(url);
  if (storagePath && !localPath) {
    const altLocalPath = path.join(process.cwd(), 'public', storagePath);
    try {
      const buf = await fs.readFile(altLocalPath);
      if (buf.length > 100) return buf;
      errors.push(`alt-local: too small (${buf.length}b)`);
    } catch (e: any) {
      errors.push(`alt-local[${storagePath}]: ${e.code || e.message}`);
    }
  }

  if (storagePath) {
    const { S3_BUCKET: bucket, S3_ENDPOINT: endpoint, S3_ACCESS_KEY_ID: accessKey, S3_SECRET_ACCESS_KEY: secretKey } = process.env;
    if (bucket && endpoint && accessKey && secretKey) {
      try {
        const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
        const client = new S3Client({
          endpoint,
          region: process.env.S3_REGION || 'auto',
          credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
          forcePathStyle: true,
        });
        const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: storagePath }));
        if (response.Body) {
          const chunks: Buffer[] = [];
          for await (const chunk of response.Body as any) {
            chunks.push(Buffer.from(chunk));
          }
          const buf = Buffer.concat(chunks);
          if (buf.length > 100) return buf;
          errors.push(`s3: file too small (${buf.length}b)`);
        } else {
          errors.push('s3: no body');
        }
      } catch (e: any) {
        errors.push(`s3[${storagePath}]: ${e.message}`);
      }
    } else {
      errors.push('s3: not configured');
    }
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const res = await fetchWithTimeout(url);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 100) return buf;
        errors.push(`http: too small (${buf.length}b)`);
      } else {
        const body = await res.text().catch(() => '');
        errors.push(`http: ${res.status} ${body.slice(0, 100)}`);
      }
    } catch (e: any) {
      errors.push(`http: ${e.name === 'AbortError' ? 'timeout' : e.message}`);
    }
  }

  throw new Error(`${label}: all download methods failed [url=${url.slice(0, 120)}] [${errors.join(', ')}]`);
}

async function getPublicUrl(localPath: string): Promise<string | null> {
  try {
    const { uploadFile } = await import('@/lib/storage');
    const path = require('path');
    const fs = require('fs/promises');
    const storagePath = `longform/${path.basename(localPath)}`;
    // uploadFile deletes the source file when cloud storage is active,
    // so upload a copy to preserve the original for later steps
    const tmpCopy = localPath + '.submagic.tmp';
    await fs.copyFile(localPath, tmpCopy);
    const publicUrl = await uploadFile(tmpCopy, storagePath);
    return publicUrl || null;
  } catch {
    return null;
  }
}

async function uploadOutput(localPath: string, filename: string, outputDir: string): Promise<void> {
  const path = require('path');
  const fs = require('fs/promises');
  try {
    const { isCloudStorage, uploadFile } = await import('@/lib/storage');
    if (isCloudStorage) {
      const tmpCopy = localPath + '.upload.tmp';
      await fs.copyFile(localPath, tmpCopy);
      await uploadFile(tmpCopy, `outputs/${filename}`);
      return;
    }
  } catch { /* fall through */ }

  await fs.mkdir(outputDir, { recursive: true });
  await fs.copyFile(localPath, path.join(outputDir, filename));
}
