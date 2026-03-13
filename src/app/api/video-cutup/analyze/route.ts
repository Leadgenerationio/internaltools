/**
 * POST /api/video-cutup/analyze
 *
 * Accepts an uploaded video path (from /api/upload) and runs
 * FFmpeg scene detection to identify clip boundaries.
 *
 * Body: { videoPath: string, threshold?: number }
 * Returns: { segments: DetectedSegment[], duration: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { existsSync } from 'fs';
import { getAuthContext } from '@/lib/api-auth';
import { detectScenes, generateSegmentThumbnails } from '@/lib/scene-detect';
import { getVideoInfo } from '@/lib/get-video-info';
import { logger } from '@/lib/logger';

export const maxDuration = 60;

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;

  const body = await request.json();
  const { videoPath, threshold = 0.3 } = body;

  if (!videoPath || typeof videoPath !== 'string') {
    return NextResponse.json({ error: 'videoPath is required' }, { status: 400 });
  }

  // Resolve the file path — videoPath is a public URL like /api/files?path=uploads/xxx.mp4
  // Extract the filename from the path
  let filename: string;
  if (videoPath.includes('path=')) {
    const url = new URL(videoPath, 'http://localhost');
    const p = url.searchParams.get('path') || '';
    filename = path.basename(p);
  } else {
    filename = path.basename(videoPath);
  }

  const filePath = path.join(UPLOAD_DIR, filename);

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'Video file not found' }, { status: 404 });
  }

  // Prevent path traversal
  if (!filePath.startsWith(UPLOAD_DIR)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const clampedThreshold = Math.max(0.1, Math.min(0.9, Number(threshold) || 0.3));

  try {
    const info = await getVideoInfo(filePath);

    logger.info('Scene detection starting', { filename, threshold: clampedThreshold, duration: info.duration });

    let segments = await detectScenes(filePath, clampedThreshold);

    // Generate thumbnails for each segment
    const fileId = path.parse(filename).name;
    segments = await generateSegmentThumbnails(filePath, segments, UPLOAD_DIR, fileId);

    logger.info('Scene detection complete', { filename, segments: segments.length });

    return NextResponse.json({
      segments,
      duration: info.duration,
      width: info.width,
      height: info.height,
    });
  } catch (err: any) {
    logger.error('Scene detection failed', { error: err.message, filename });
    return NextResponse.json(
      { error: err.message || 'Scene detection failed' },
      { status: 500 },
    );
  }
}
