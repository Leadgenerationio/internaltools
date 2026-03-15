/**
 * POST /api/longform-from-video/process
 *
 * Process an uploaded video: extract audio, detect scenes, transcribe.
 * Returns extracted audio URL + scenes with timestamps and transcribed text.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { extractAudio, getMediaDuration } from '@/lib/longform-stitcher';
import { transcribeAudio } from '@/lib/elevenlabs';
import { detectScenes, generateSegmentThumbnails } from '@/lib/scene-detect';
import { fileUrl } from '@/lib/file-url';
import { extractPublicPath } from '@/lib/path-utils';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export const maxDuration = 120; // 2 minutes for processing

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;

  const body = await request.json();
  const { videoPath, videoDuration } = body as { videoPath: string; videoDuration: number };

  if (!videoPath) {
    return NextResponse.json({ error: 'videoPath is required' }, { status: 400 });
  }

  // Resolve local file path
  const cleanPath = extractPublicPath(videoPath);
  const localPath = path.join(PUBLIC_DIR, cleanPath);

  try {
    await fs.access(localPath);
  } catch {
    return NextResponse.json({ error: 'Video file not found' }, { status: 404 });
  }

  const id = crypto.randomUUID();
  const tempDir = path.join(UPLOADS_DIR, `lfv_${id}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // 1. Extract audio
    const audioPath = path.join(tempDir, 'extracted_audio.mp3');
    await extractAudio(localPath, audioPath);
    const audioDuration = await getMediaDuration(audioPath);
    const audioUrl = fileUrl(`uploads/lfv_${id}/extracted_audio.mp3`);

    // 2. Detect scenes
    let sceneTimestamps: Array<{ start: number; end: number; thumbnail: string }>;
    try {
      const detected = await detectScenes(localPath, 0.3);
      // Generate thumbnails
      const thumbDir = path.join(tempDir, 'thumbs');
      const withThumbs = await generateSegmentThumbnails(localPath, detected, thumbDir, id);
      sceneTimestamps = withThumbs.map((s) => ({
        start: s.startTime,
        end: s.endTime,
        thumbnail: s.thumbnailUrl ? fileUrl(path.relative(PUBLIC_DIR, s.thumbnailUrl)) : '',
      }));
    } catch (sceneErr: any) {
      console.warn('[longform-from-video] Scene detection failed, using fixed intervals:', sceneErr.message);
      // Fallback: split into ~5-second segments
      const dur = videoDuration || audioDuration;
      const segmentDuration = 5;
      sceneTimestamps = [];
      for (let t = 0; t < dur; t += segmentDuration) {
        sceneTimestamps.push({
          start: t,
          end: Math.min(t + segmentDuration, dur),
          thumbnail: '',
        });
      }
    }

    // Ensure at least 1 scene
    if (sceneTimestamps.length === 0) {
      sceneTimestamps = [{ start: 0, end: audioDuration, thumbnail: '' }];
    }

    // 4. Transcribe audio via ElevenLabs STT
    let transcription: { text: string; words: Array<{ text: string; start: number; end: number; type: string }> } | null = null;
    try {
      transcription = await transcribeAudio(audioPath);
    } catch (err: any) {
      console.warn('[longform-from-video] Transcription failed:', err.message);
    }

    // 5. Map words to scenes
    const scenes = sceneTimestamps.map((scene, idx) => {
      let text = '';
      if (transcription?.words) {
        const sceneWords = transcription.words
          .filter((w) => w.type === 'word' && w.start >= scene.start && w.start < scene.end)
          .map((w) => w.text);
        text = sceneWords.join(' ');
      }

      return {
        id: `scene_${idx}`,
        order: idx,
        start: scene.start,
        end: scene.end,
        duration: scene.end - scene.start,
        text,
        thumbnail: scene.thumbnail || '',
        clipUrl: '', // empty = use original video segment
        source: 'original' as const,
      };
    });

    return NextResponse.json({
      audioUrl,
      audioDuration,
      fullTranscript: transcription?.text || '',
      scenes,
    });
  } catch (err: any) {
    // Clean up on error
    try { await fs.rm(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
    return NextResponse.json({ error: err.message || 'Processing failed' }, { status: 500 });
  }
}
