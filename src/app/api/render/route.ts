import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { renderVideo, batchRender } from '@/lib/ffmpeg-renderer';
import type { TextOverlay, MusicTrack, UploadedVideo } from '@/lib/types';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'outputs');
const PUBLIC_DIR = path.join(process.cwd(), 'public');

function isPathSafe(resolvedPath: string, allowedDir: string): boolean {
  const normalized = path.normalize(resolvedPath);
  return normalized.startsWith(path.normalize(allowedDir));
}

export const maxDuration = 300; // 5 min for batch renders

export async function POST(request: NextRequest) {
  try {
    // Validate payload size
    const rawBody = await request.text();
    if (rawBody.length > 500_000) {
      return NextResponse.json({ error: 'Request payload too large' }, { status: 413 });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { videos, overlays, music, quality } = body as {
      videos: UploadedVideo[];
      overlays: TextOverlay[];
      music: MusicTrack | null;
      quality?: 'draft' | 'final';
    };

    if (!videos || videos.length === 0) {
      return NextResponse.json({ error: 'No videos to render' }, { status: 400 });
    }

    if (!overlays || overlays.length === 0) {
      return NextResponse.json({ error: 'No text overlays defined' }, { status: 400 });
    }

    // Prepare music file path - validate it stays within public
    let musicConfig: MusicTrack | null = null;
    if (music && music.file) {
      const filePath = music.file.startsWith('/') ? music.file.slice(1) : music.file;
      const resolvedMusic = path.join(process.cwd(), 'public', filePath);
      if (!isPathSafe(resolvedMusic, PUBLIC_DIR)) {
        return NextResponse.json({ error: 'Invalid music path' }, { status: 400 });
      }
      if (!fs.existsSync(resolvedMusic)) {
        return NextResponse.json({ error: 'Music file not found' }, { status: 400 });
      }
      musicConfig = { ...music, file: resolvedMusic };
    }

    // Prepare video paths - validate they stay within uploads
    const videoPaths: { inputPath: string; outputPath: string; width: number; height: number; duration: number }[] = [];
    for (const v of videos) {
      const cleanPath = v.path.startsWith('/') ? v.path.slice(1) : v.path;
      if (!cleanPath.startsWith('uploads/')) {
        return NextResponse.json({ error: 'Invalid video path' }, { status: 400 });
      }
      const inputPath = path.join(process.cwd(), 'public', cleanPath);
      if (!isPathSafe(inputPath, UPLOAD_DIR)) {
        return NextResponse.json({ error: 'Invalid video path' }, { status: 400 });
      }
      if (!fs.existsSync(inputPath)) {
        return NextResponse.json({ error: `Video not found: ${v.originalName}` }, { status: 400 });
      }
      videoPaths.push({
        inputPath,
        outputPath: path.join(OUTPUT_DIR, `${uuidv4()}_output.mp4`),
        width: v.width,
        height: v.height,
        duration: v.duration,
      });
    }

    const outputPaths = await batchRender(videoPaths, overlays, musicConfig, undefined, quality);

    // Return paths relative to public dir
    const results = outputPaths.map((p, i) => ({
      videoId: videos[i].id,
      originalName: videos[i].originalName,
      outputUrl: `/outputs/${path.basename(p)}`,
    }));

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('Render error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
