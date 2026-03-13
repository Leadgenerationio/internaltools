/**
 * POST /api/storyblocks/download
 *
 * Download a Storyblocks stock video to local uploads,
 * generate thumbnail, and save to media library.
 *
 * Body: { stockItemId: number, title: string }
 * Returns: { video: UploadedVideo }
 */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { mkdir } from 'fs/promises';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { v4 as uuidv4 } from 'uuid';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getAuthContext } from '@/lib/api-auth';
import { getDownloadUrl } from '@/lib/storyblocks';
import { getVideoInfo } from '@/lib/get-video-info';
import { saveToMediaLibrary } from '@/lib/save-to-media-library';
import { fileUrl } from '@/lib/file-url';
import { logger } from '@/lib/logger';

const execFileAsync = promisify(execFile);

export const maxDuration = 120;

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId } = authResult.auth;

  const body = await request.json();
  const { stockItemId, title } = body;

  if (!stockItemId || typeof stockItemId !== 'number') {
    return NextResponse.json({ error: 'stockItemId is required' }, { status: 400 });
  }

  if (!process.env.STORYBLOCKS_PUBLIC_KEY || !process.env.STORYBLOCKS_PRIVATE_KEY) {
    return NextResponse.json({ error: 'Storyblocks not configured' }, { status: 503 });
  }

  try {
    // Get signed download URL
    const downloadUrl = await getDownloadUrl(stockItemId);

    if (!downloadUrl) {
      return NextResponse.json({ error: 'No download URL returned' }, { status: 502 });
    }

    // Download to local uploads
    if (!fs.existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    const id = uuidv4();
    const filename = `${id}.mp4`;
    const filepath = path.join(UPLOAD_DIR, filename);

    logger.info('Downloading Storyblocks video', { stockItemId, filename });

    const dlRes = await fetch(downloadUrl);
    if (!dlRes.ok || !dlRes.body) {
      throw new Error(`Download failed (${dlRes.status})`);
    }

    const readable = Readable.fromWeb(dlRes.body as any);
    const writable = fs.createWriteStream(filepath);
    await pipeline(readable, writable);

    // Get video metadata
    const info = await getVideoInfo(filepath);
    const fileStat = await fs.promises.stat(filepath);

    // Generate thumbnail
    const thumbFilename = `${id}_thumb.jpg`;
    const thumbPath = path.join(UPLOAD_DIR, thumbFilename);
    let thumbUrl = '';

    try {
      await execFileAsync('ffmpeg', [
        '-y', '-i', filepath,
        '-vframes', '1', '-ss', '0',
        '-vf', 'scale=180:-1',
        thumbPath,
      ]);
      thumbUrl = fileUrl(`uploads/${thumbFilename}`);
    } catch {
      logger.warn('Storyblocks thumbnail generation failed', { filename });
    }

    const storagePath = `uploads/${filename}`;
    const cleanTitle = (title || 'Stock Video').replace(/[<>]/g, '');

    // Save to media library
    const storageFileId = await saveToMediaLibrary({
      companyId,
      storagePath,
      publicUrl: fileUrl(storagePath),
      sizeBytes: fileStat.size,
      mimeType: 'video/mp4',
      originalName: cleanTitle,
      duration: info.duration,
      width: info.width,
      height: info.height,
      thumbnailUrl: thumbUrl || undefined,
    }).catch(() => null);

    logger.info('Storyblocks download complete', { filename, duration: info.duration });

    return NextResponse.json({
      video: {
        id,
        filename,
        originalName: cleanTitle,
        path: fileUrl(storagePath),
        duration: info.duration,
        width: info.width,
        height: info.height,
        thumbnail: thumbUrl,
        ...(storageFileId && { storageFileId }),
      },
    });
  } catch (err: any) {
    logger.error('Storyblocks download error', { error: err.message, stockItemId });
    return NextResponse.json(
      { error: err.message || 'Download failed' },
      { status: 500 },
    );
  }
}
