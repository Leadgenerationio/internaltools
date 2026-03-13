/**
 * POST /api/video-cutup/split
 *
 * Split a video into selected clips and save them to the media library.
 *
 * Body: {
 *   videoPath: string,
 *   originalName: string,
 *   segments: { index: number, startTime: number, endTime: number }[]
 * }
 *
 * Returns: { clips: { index: number, url: string, storageFileId: string | null }[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { existsSync } from 'fs';
import { stat } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { getAuthContext } from '@/lib/api-auth';
import { splitClip } from '@/lib/scene-detect';
import { getVideoInfo } from '@/lib/get-video-info';
import { saveToMediaLibrary } from '@/lib/save-to-media-library';
import { fileUrl } from '@/lib/file-url';
import { logger } from '@/lib/logger';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const maxDuration = 120;

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

interface SegmentRequest {
  index: number;
  startTime: number;
  endTime: number;
}

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId } = authResult.auth;

  const body = await request.json();
  const { videoPath, originalName, segments } = body as {
    videoPath: string;
    originalName: string;
    segments: SegmentRequest[];
  };

  if (!videoPath || !segments || segments.length === 0) {
    return NextResponse.json({ error: 'videoPath and segments are required' }, { status: 400 });
  }

  if (segments.length > 50) {
    return NextResponse.json({ error: 'Maximum 50 clips per split' }, { status: 400 });
  }

  // Resolve file path
  let filename: string;
  if (videoPath.includes('path=')) {
    const url = new URL(videoPath, 'http://localhost');
    const p = url.searchParams.get('path') || '';
    filename = path.basename(p);
  } else {
    filename = path.basename(videoPath);
  }

  const filePath = path.join(UPLOAD_DIR, filename);

  if (!existsSync(filePath) || !filePath.startsWith(UPLOAD_DIR)) {
    return NextResponse.json({ error: 'Video file not found' }, { status: 404 });
  }

  const baseName = originalName
    ? path.parse(originalName).name.replace(/[^a-zA-Z0-9_\- ]/g, '')
    : 'clip';

  logger.info('Splitting video', { filename, clipCount: segments.length });

  const results = await Promise.allSettled(
    segments.map(async (seg) => {
      const clipId = uuidv4();
      const clipFilename = `${clipId}.mp4`;
      const clipPath = path.join(UPLOAD_DIR, clipFilename);
      const storagePath = `uploads/${clipFilename}`;

      // Split the clip
      await splitClip(filePath, seg.startTime, seg.endTime, clipPath);

      // Get clip metadata
      const info = await getVideoInfo(clipPath);
      const fileStat = await stat(clipPath);

      // Generate thumbnail
      const thumbFilename = `${clipId}_thumb.jpg`;
      const thumbPath = path.join(UPLOAD_DIR, thumbFilename);
      let thumbUrl = '';
      try {
        await execFileAsync('ffmpeg', [
          '-y', '-i', clipPath,
          '-vframes', '1', '-ss', '0',
          '-vf', 'scale=180:-1',
          thumbPath,
        ], { timeout: 10_000 });
        thumbUrl = fileUrl(`uploads/${thumbFilename}`);
      } catch { /* thumbnail optional */ }

      // Save to media library
      const clipName = `${baseName} - Clip ${seg.index + 1}`;
      const storageFileId = await saveToMediaLibrary({
        companyId,
        storagePath,
        publicUrl: fileUrl(storagePath),
        sizeBytes: fileStat.size,
        mimeType: 'video/mp4',
        originalName: clipName,
        duration: info.duration,
        width: info.width,
        height: info.height,
        thumbnailUrl: thumbUrl || undefined,
      }).catch(() => null);

      return {
        index: seg.index,
        url: fileUrl(storagePath),
        thumbnailUrl: thumbUrl,
        duration: info.duration,
        name: clipName,
        storageFileId,
      };
    }),
  );

  const clips = results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
    .map((r) => r.value);

  const failed = results.filter((r) => r.status === 'rejected').length;

  logger.info('Split complete', { saved: clips.length, failed });

  return NextResponse.json({
    clips,
    savedCount: clips.length,
    failedCount: failed,
  });
}
