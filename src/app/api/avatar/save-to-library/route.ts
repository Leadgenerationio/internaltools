/**
 * POST /api/avatar/save-to-library
 *
 * Save an avatar video to the company media library (StorageFile).
 * FREE — no token cost.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { saveToMediaLibrary } from '@/lib/save-to-media-library';
import { extractPublicPath } from '@/lib/path-utils';
import { fileUrl } from '@/lib/file-url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execFileAsync = promisify(execFile);

export const maxDuration = 30;

interface RequestBody {
  videoUrl: string;
  name?: string;
}

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId } = authResult.auth;

  const body: RequestBody = await request.json();
  const { videoUrl, name = 'Avatar Video' } = body;

  if (!videoUrl?.trim()) {
    return NextResponse.json({ error: 'Video URL is required' }, { status: 400 });
  }

  const publicPath = extractPublicPath(videoUrl);
  const localPath = path.join(process.cwd(), 'public', publicPath);

  try {
    await fs.access(localPath);
  } catch {
    return NextResponse.json({ error: 'Video file not found' }, { status: 404 });
  }

  try {
    // Get file size
    const stat = await fs.stat(localPath);

    // Get video dimensions + duration
    let width = 1080, height = 1920, duration = 0;
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'quiet', '-print_format', 'json',
        '-show_streams', '-show_format', localPath,
      ]);
      const parsed = JSON.parse(stdout);
      const videoStream = parsed.streams?.find((s: any) => s.codec_type === 'video');
      if (videoStream) {
        width = videoStream.width || width;
        height = videoStream.height || height;
      }
      duration = parseFloat(parsed.format?.duration) || 0;
    } catch { /* use defaults */ }

    const storageFileId = await saveToMediaLibrary({
      companyId,
      storagePath: publicPath,
      publicUrl: fileUrl(publicPath),
      sizeBytes: Number(stat.size),
      mimeType: 'video/mp4',
      originalName: name,
      duration,
      width,
      height,
    });

    if (!storageFileId) {
      return NextResponse.json({ error: 'Failed to save to library' }, { status: 500 });
    }

    return NextResponse.json({ success: true, storageFileId });
  } catch (err: any) {
    console.error('Save to library error:', err);
    return NextResponse.json({ error: err.message || 'Failed to save' }, { status: 500 });
  }
}
