/**
 * POST /api/avatar/crop
 *
 * Crop/resize an avatar video to a target aspect ratio with custom position.
 * Uses FFmpeg crop filter with caller-specified x/y offset.
 * FREE — no token cost (already paid for the original generation).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileUrl } from '@/lib/file-url';
import { extractPublicPath } from '@/lib/path-utils';

const execFileAsync = promisify(execFile);

export const maxDuration = 120;

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'outputs');

const ASPECT_TARGETS: Record<string, { w: number; h: number }> = {
  '9:16': { w: 1080, h: 1920 },
  '16:9': { w: 1920, h: 1080 },
  '1:1': { w: 1080, h: 1080 },
};

interface RequestBody {
  videoUrl: string;
  aspectRatio: '9:16' | '16:9' | '1:1';
  /** Crop position 0-1 (0 = top/left, 0.5 = center, 1 = bottom/right) */
  posX?: number;
  posY?: number;
}

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;

  const body: RequestBody = await request.json();
  const { videoUrl, aspectRatio, posX = 0.5, posY = 0.5 } = body;

  if (!videoUrl?.trim()) {
    return NextResponse.json({ error: 'Video URL is required' }, { status: 400 });
  }
  if (!ASPECT_TARGETS[aspectRatio]) {
    return NextResponse.json({ error: 'Invalid aspect ratio. Use 9:16, 16:9, or 1:1' }, { status: 400 });
  }

  // Resolve video to local file path
  const publicPath = extractPublicPath(videoUrl);
  const localPath = path.join(process.cwd(), 'public', publicPath);

  try {
    await fs.access(localPath);
  } catch {
    return NextResponse.json({ error: 'Video file not found' }, { status: 404 });
  }

  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    // Get source video dimensions
    const { stdout: probeOut } = await execFileAsync('ffprobe', [
      '-v', 'quiet', '-print_format', 'json',
      '-show_streams', localPath,
    ]);
    const streams = JSON.parse(probeOut).streams;
    const videoStream = streams?.find((s: any) => s.codec_type === 'video');
    if (!videoStream) {
      return NextResponse.json({ error: 'No video stream found' }, { status: 400 });
    }

    const srcW = videoStream.width as number;
    const srcH = videoStream.height as number;
    const target = ASPECT_TARGETS[aspectRatio];

    // Calculate crop dimensions to maintain target aspect ratio
    const targetAR = target.w / target.h;
    const srcAR = srcW / srcH;

    let cropW: number, cropH: number;
    if (srcAR > targetAR) {
      // Source is wider — crop width
      cropH = srcH;
      cropW = Math.round(srcH * targetAR);
    } else {
      // Source is taller — crop height
      cropW = srcW;
      cropH = Math.round(srcW / targetAR);
    }

    // Clamp to source dimensions
    cropW = Math.min(cropW, srcW);
    cropH = Math.min(cropH, srcH);

    // Calculate position based on posX/posY (0-1)
    const clampedX = Math.max(0, Math.min(1, posX));
    const clampedY = Math.max(0, Math.min(1, posY));
    const cropX = Math.round((srcW - cropW) * clampedX);
    const cropY = Math.round((srcH - cropH) * clampedY);

    const outputFilename = `avatar_cropped_${crypto.randomUUID()}.mp4`;
    const outputPath = path.join(OUTPUT_DIR, outputFilename);

    // FFmpeg: crop then scale to exact target dimensions
    await execFileAsync('ffmpeg', [
      '-y', '-i', localPath,
      '-vf', `crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${target.w}:${target.h}`,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      outputPath,
    ]);

    // Verify output
    const stat = await fs.stat(outputPath);
    if (stat.size < 1000) {
      throw new Error('Cropped output is too small — likely corrupt');
    }

    // Upload to S3 if configured
    try {
      const { isCloudStorage, uploadFile } = await import('@/lib/storage');
      if (isCloudStorage) {
        const tmpCopy = outputPath + '.s3upload.tmp';
        await fs.copyFile(outputPath, tmpCopy);
        await uploadFile(tmpCopy, `outputs/${outputFilename}`);
      }
    } catch { /* local fallback */ }

    // Get duration
    let duration = 0;
    try {
      const { stdout: durOut } = await execFileAsync('ffprobe', [
        '-v', 'quiet', '-print_format', 'json', '-show_format', outputPath,
      ]);
      duration = parseFloat(JSON.parse(durOut).format.duration) || 0;
    } catch { /* ignore */ }

    return NextResponse.json({
      videoUrl: fileUrl(`outputs/${outputFilename}`),
      aspectRatio,
      width: target.w,
      height: target.h,
      durationSeconds: duration,
    });
  } catch (err: any) {
    console.error('Avatar crop error:', err);
    return NextResponse.json({ error: err.message || 'Failed to crop video' }, { status: 500 });
  }
}
