import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { renderVideo, batchRender } from '@/lib/ffmpeg-renderer';
import type { TextOverlay, MusicTrack, UploadedVideo } from '@/lib/types';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'outputs');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videos, overlays, music } = body as {
      videos: UploadedVideo[];
      overlays: TextOverlay[];
      music: MusicTrack | null;
    };

    if (!videos || videos.length === 0) {
      return NextResponse.json({ error: 'No videos to render' }, { status: 400 });
    }

    if (!overlays || overlays.length === 0) {
      return NextResponse.json({ error: 'No text overlays defined' }, { status: 400 });
    }

    // Prepare music file path (music.file is e.g. /music/xxx.mp3 - strip leading / for path.join)
    let musicConfig: MusicTrack | null = null;
    if (music && music.file) {
      const filePath = music.file.startsWith('/') ? music.file.slice(1) : music.file;
      musicConfig = {
        ...music,
        file: path.join(process.cwd(), 'public', filePath),
      };
    }

    // Batch render all videos
    const videoPaths = videos.map((v) => ({
      inputPath: path.join(process.cwd(), 'public', v.path),
      outputPath: path.join(OUTPUT_DIR, `${uuidv4()}_output.mp4`),
      width: v.width,
      height: v.height,
      duration: v.duration,
    }));

    const outputPaths = await batchRender(videoPaths, overlays, musicConfig);

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
