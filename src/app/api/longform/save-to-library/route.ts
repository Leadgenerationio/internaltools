/**
 * POST /api/longform/save-to-library
 *
 * Save an AI-generated clip to the company's media library.
 * Downloads the clip, extracts metadata, generates thumbnail,
 * and creates a StorageFile record.
 *
 * Free operation (0 tokens).
 */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getAuthContext } from '@/lib/api-auth';
import { saveToMediaLibrary } from '@/lib/save-to-media-library';
import { fileUrl } from '@/lib/file-url';

export const maxDuration = 30;

const execFileAsync = promisify(execFile);
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

interface RequestBody {
  clipUrl: string;
  name: string;
}

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId } = authResult.auth;

  const body: RequestBody = await request.json();
  const { clipUrl, name } = body;

  if (!clipUrl) {
    return NextResponse.json({ error: 'clipUrl is required' }, { status: 400 });
  }

  try {
    // Download the clip
    const resolvedUrl = clipUrl.startsWith('/')
      ? `http://localhost:${process.env.PORT || 3000}${clipUrl}`
      : clipUrl;

    // Try local file first (if it's a fileUrl pointing to local disk)
    let buffer: Buffer;
    const pathMatch = clipUrl.match(/[?&]path=([^&]+)/);
    if (pathMatch) {
      const localPath = path.join(process.cwd(), 'public', decodeURIComponent(pathMatch[1]));
      try {
        buffer = await fs.readFile(localPath);
      } catch {
        // Fall through to fetch
        const res = await fetch(resolvedUrl);
        if (!res.ok) throw new Error(`Download failed: ${res.status}`);
        buffer = Buffer.from(await res.arrayBuffer());
      }
    } else {
      const res = await fetch(resolvedUrl);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      buffer = Buffer.from(await res.arrayBuffer());
    }

    // Save to uploads directory
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const safeName = (name || 'clip').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safeName}_${crypto.randomUUID()}.mp4`;
    const filePath = path.join(UPLOAD_DIR, filename);
    await fs.writeFile(filePath, buffer);

    // Extract metadata via ffprobe
    let duration = 0;
    let width = 1080;
    let height = 1920;
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format', '-show_streams',
        filePath,
      ]);
      const data = JSON.parse(stdout);
      duration = parseFloat(data.format?.duration || '0');
      const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');
      if (videoStream) {
        width = videoStream.width || 1080;
        height = videoStream.height || 1920;
      }
    } catch { /* use defaults */ }

    // Generate thumbnail
    let thumbnailUrl: string | undefined;
    try {
      const thumbFilename = `thumb_${filename.replace('.mp4', '.jpg')}`;
      const thumbPath = path.join(UPLOAD_DIR, thumbFilename);
      await execFileAsync('ffmpeg', [
        '-y', '-i', filePath,
        '-ss', '1', '-vframes', '1',
        '-vf', 'scale=320:-1',
        thumbPath,
      ]);
      thumbnailUrl = fileUrl(`uploads/${thumbFilename}`);
    } catch { /* no thumbnail is fine */ }

    // Upload to S3 if configured
    const storagePath = `uploads/${filename}`;
    try {
      const { isCloudStorage, uploadFile } = await import('@/lib/storage');
      if (isCloudStorage) {
        await uploadFile(filePath, storagePath);
      }
    } catch { /* not configured */ }

    // Save to media library DB
    const recordId = await saveToMediaLibrary({
      companyId,
      storagePath,
      publicUrl: fileUrl(storagePath),
      sizeBytes: buffer.length,
      mimeType: 'video/mp4',
      originalName: name || filename,
      duration,
      width,
      height,
      thumbnailUrl,
    });

    return NextResponse.json({ id: recordId, filename, storagePath });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to save to library' },
      { status: 500 },
    );
  }
}
