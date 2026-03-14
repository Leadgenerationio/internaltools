/**
 * POST /api/longform/finalize
 *
 * Assemble final longform videos synchronously with streaming progress.
 * Downloads clips + voiceover, runs FFmpeg assembly, optionally captions via Submagic.
 *
 * Assembly is FREE — all costs (voiceover, scene generation) already paid incrementally.
 *
 * Returns NDJSON stream:
 *   {"progress": 10, "message": "Downloading clips..."}
 *   {"progress": 70, "message": "Assembling video..."}
 *   {"done": true, "videos": [...]}
 *   or {"error": "something failed"}
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { assembleAdV2, getMediaDuration } from '@/lib/longform-stitcher';
import { captionVideo } from '@/lib/submagic';
import { fileUrl } from '@/lib/file-url';
import type { CaptionConfig, LongformResultItem } from '@/lib/longform-types';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export const maxDuration = 300; // 5 minutes for video processing

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'outputs');
const TEMP_BASE = path.join(process.cwd(), 'public', 'outputs', 'longform_temp');

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

// ─── File download helpers ─────────────────────────────────────────────────

function resolveLocalPath(url: string): string | null {
  // /api/files?path=outputs/xxx.mp4 → public/outputs/xxx.mp4
  if (url.includes('/api/files')) {
    const match = url.match(/[?&]path=([^&]+)/);
    if (match) {
      const decoded = decodeURIComponent(match[1]);
      return path.join(process.cwd(), 'public', decoded);
    }
  }
  // Relative path starting with / (e.g. /uploads/xxx.mp4)
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

async function downloadFile(url: string, label: string): Promise<Buffer> {
  // 1. Try local filesystem first (fastest, no network)
  const localPath = resolveLocalPath(url);
  if (localPath) {
    try {
      const buf = await fs.readFile(localPath);
      if (buf.length > 100) return buf;
    } catch {
      // File not on local disk — fall through to fetch
    }
  }

  // 2. Try direct HTTP fetch (CDN URLs, Supabase URLs, etc.)
  const fetchUrl = url.startsWith('/') ? `http://localhost:${process.env.PORT || 3000}${url}` : url;
  try {
    const res = await fetch(fetchUrl, {
      headers: process.env.AUTH_SECRET ? { 'Authorization': `Bearer ${process.env.AUTH_SECRET}` } : {},
    });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 100) return buf;
    }
  } catch {
    // Fall through to S3
  }

  // 3. Try S3 direct download
  const storagePath = extractStoragePath(url);
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
        }
      } catch { /* fall through */ }
    }
  }

  throw new Error(`${label}: all download methods failed`);
}

// ─── Get a public URL for Submagic captioning ──────────────────────────────

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

// ─── Upload final output ─────────────────────────────────────────────────────

async function uploadOutput(localPath: string, filename: string): Promise<void> {
  // Prefer S3
  try {
    const { isCloudStorage, uploadFile } = await import('@/lib/storage');
    if (isCloudStorage) {
      const tmpCopy = localPath + '.upload.tmp';
      await fs.copyFile(localPath, tmpCopy);
      await uploadFile(tmpCopy, `outputs/${filename}`);
      return;
    }
  } catch { /* fall through */ }

  // Local: copy to outputs dir
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.copyFile(localPath, path.join(OUTPUT_DIR, filename));
}

// ─── Main route ──────────────────────────────────────────────────────────────

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

  // Process synchronously — returns plain JSON when done
  const tempDir = path.join(TEMP_BASE, `finalize_${crypto.randomUUID()}`);
  const results: LongformResultItem[] = [];
  const failures: string[] = [];

  try {
    await fs.mkdir(tempDir, { recursive: true });

    for (let vi = 0; vi < variants.length; vi++) {
      const v = variants[vi];
      const variantDir = path.join(tempDir, `v_${vi}`);
      await fs.mkdir(variantDir, { recursive: true });

      try {
        // 1. Download voiceover
        const voPath = path.join(variantDir, 'voiceover.mp3');
        const voBuffer = await downloadFile(v.voiceoverUrl, `Voiceover (${v.variant})`);
        await fs.writeFile(voPath, voBuffer);

        // 2. Download scene clips
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

        // 3. Download music
        let musicPath: string | undefined;
        if (music?.url) {
          const mPath = path.join(variantDir, 'music.mp3');
          const musicBuffer = await downloadFile(music.url, `Music (${v.variant})`);
          await fs.writeFile(mPath, musicBuffer);
          musicPath = mPath;
        }

        // 4. Assemble: normalize → concat → voiceover → music
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

        // 5. Captions via Submagic (optional)
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

        // 6. Upload final video
        const duration = await getMediaDuration(finalPath).catch(() => 30);
        const outputFilename = `longform_final_${v.variant.replace(/[^a-zA-Z0-9_-]/g, '_')}_${crypto.randomUUID()}.mp4`;
        await uploadOutput(finalPath, outputFilename);

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
      return NextResponse.json(
        { error: failures[0] || 'All variants failed to finalize' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      videos: results,
      failed: failures.length,
      ...(failures.length > 0 && { warning: `${failures.length} of ${variants.length} variants failed` }),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Finalize failed' }, { status: 500 });
  } finally {
    try { await fs.rm(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
