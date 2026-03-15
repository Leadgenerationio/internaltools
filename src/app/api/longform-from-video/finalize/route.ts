/**
 * POST /api/longform-from-video/finalize
 *
 * Assemble final video: scene clips + extracted audio + music + captions.
 * Scenes without b-roll use the original video segment.
 * Enqueues BullMQ job if available, otherwise processes synchronously.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { getLongformQueue } from '@/lib/queue';
import { extractPublicPath } from '@/lib/path-utils';
import type { CaptionConfig } from '@/lib/longform-types';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export const maxDuration = 300;

interface RequestBody {
  originalVideoPath: string;
  extractedAudioUrl: string;
  scenes: Array<{
    start: number;
    end: number;
    clipUrl?: string; // b-roll URL, empty = use original
  }>;
  music: { url: string; volume: number } | null;
  captionConfig: CaptionConfig;
  aspectRatio: '9:16' | '16:9' | '1:1';
}

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;

  const body: RequestBody = await request.json();
  const { originalVideoPath, extractedAudioUrl, scenes, music, captionConfig, aspectRatio } = body;

  if (!originalVideoPath || !extractedAudioUrl || !scenes?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Try BullMQ background job
  const queue = getLongformQueue();
  if (queue) {
    const jobData = {
      companyId: authResult.auth.companyId,
      userId: authResult.auth.userId,
      originalVideoPath,
      extractedAudioUrl,
      scenes,
      music,
      captionConfig,
      aspectRatio,
    };

    const job = await queue.add('longform-from-video-finalize', jobData, {
      attempts: 1,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 3600 },
    });

    return NextResponse.json({ jobId: job.id });
  }

  // Synchronous fallback
  const { assembleAdV2, getMediaDuration, extractSegment } = await import('@/lib/longform-stitcher');
  const { captionVideo } = await import('@/lib/submagic');
  const { fileUrl } = await import('@/lib/file-url');

  const PUBLIC_DIR = path.join(process.cwd(), 'public');
  const OUTPUT_DIR = path.join(PUBLIC_DIR, 'outputs');
  const TEMP_BASE = path.join(OUTPUT_DIR, 'lfv_temp');
  const tempDir = path.join(TEMP_BASE, `finalize_${crypto.randomUUID()}`);

  try {
    await fs.mkdir(tempDir, { recursive: true });

    // Resolve original video path
    const originalCleanPath = extractPublicPath(originalVideoPath);
    const originalLocalPath = path.join(PUBLIC_DIR, originalCleanPath);

    // Resolve extracted audio path
    const audioCleanPath = extractPublicPath(extractedAudioUrl);
    const audioLocalPath = path.join(PUBLIC_DIR, audioCleanPath);

    // Build clip list: for each scene, either use b-roll or extract original segment
    const clipPaths: string[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const duration = scene.end - scene.start;

      if (scene.clipUrl) {
        // B-roll provided — download/resolve it
        const brollCleanPath = extractPublicPath(scene.clipUrl);
        const brollLocalPath = path.join(PUBLIC_DIR, brollCleanPath);
        try {
          await fs.access(brollLocalPath);
          clipPaths.push(brollLocalPath);
        } catch {
          // Try downloading if it's a URL
          const clipPath = path.join(tempDir, `broll_${i}.mp4`);
          const res = await fetch(scene.clipUrl);
          if (res.ok && res.body) {
            const { Readable } = await import('stream');
            const { pipeline } = await import('stream/promises');
            const fsMod = await import('fs');
            await pipeline(Readable.fromWeb(res.body as any), fsMod.createWriteStream(clipPath));
            clipPaths.push(clipPath);
          } else {
            throw new Error(`Failed to download b-roll for scene ${i}`);
          }
        }
      } else {
        // No b-roll — extract original video segment
        const segPath = path.join(tempDir, `seg_${i}.mp4`);
        await extractSegment(originalLocalPath, scene.start, duration, segPath);
        clipPaths.push(segPath);
      }
    }

    // Assemble: normalize clips → concatenate → merge extracted audio → mix music
    const rawPath = path.join(tempDir, 'assembled.mp4');
    let musicPath: string | undefined;
    if (music?.url) {
      const musicCleanPath = extractPublicPath(music.url);
      musicPath = path.join(PUBLIC_DIR, musicCleanPath);
    }

    await assembleAdV2({
      clips: clipPaths,
      voiceoverPath: audioLocalPath,
      outputPath: rawPath,
      tempDir: path.join(tempDir, 'stitch'),
      aspectRatio: aspectRatio || '9:16',
      musicPath,
      musicVolume: music?.volume ?? 0.15,
    });

    // Captions via Submagic (optional)
    let finalPath = rawPath;
    let captioned = false;
    if (captionConfig?.enabled && process.env.SUBMAGIC_API_KEY) {
      try {
        const { uploadFile } = await import('@/lib/storage');
        const storagePath = `longform/${path.basename(rawPath)}`;
        const publicUrl = await uploadFile(rawPath, storagePath);
        if (publicUrl) {
          const captionedPath = path.join(tempDir, 'captioned.mp4');
          await captionVideo(publicUrl, captionedPath, captionConfig, 'Longform From Video');
          finalPath = captionedPath;
          captioned = true;
        }
      } catch (err: any) {
        console.warn('[longform-from-video] Captioning failed:', err.message);
      }
    }

    // Upload output
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const outputFilename = `lfv_final_${crypto.randomUUID()}.mp4`;
    const outputDest = path.join(OUTPUT_DIR, outputFilename);
    await fs.copyFile(finalPath, outputDest);

    try {
      const { isCloudStorage, uploadFile } = await import('@/lib/storage');
      if (isCloudStorage) {
        await uploadFile(outputDest, `outputs/${outputFilename}`);
      }
    } catch { /* local fallback */ }

    const duration = await getMediaDuration(outputDest).catch(() => 30);

    return NextResponse.json({
      videos: [{
        variant: 'from-video',
        videoUrl: fileUrl(`outputs/${outputFilename}`),
        captioned,
        durationSeconds: duration,
      }],
      failed: 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Finalize failed' }, { status: 500 });
  } finally {
    try { await fs.rm(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
