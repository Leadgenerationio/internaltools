/**
 * POST /api/longform-from-video/process
 *
 * Process an uploaded video: extract audio, transcribe with ElevenLabs STT,
 * split into scenes by sentence boundaries, generate thumbnails.
 *
 * For talking-head videos, visual scene detection is useless (no cuts).
 * Instead we split by speech: transcribe → find sentence boundaries → create scenes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { extractAudio, getMediaDuration } from '@/lib/longform-stitcher';
import { transcribeAudio, type STTWord } from '@/lib/elevenlabs';
import { fileUrl } from '@/lib/file-url';
import { extractPublicPath } from '@/lib/path-utils';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const execFileAsync = promisify(execFile);

export const maxDuration = 120;

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');

/**
 * Split transcribed words into sentence-based scenes (~5-10s each).
 * Uses punctuation (. ! ?) and natural pauses (>0.5s gap) as boundaries.
 */
function splitBySentences(
  words: STTWord[],
  totalDuration: number,
  targetDuration = 7,
  minDuration = 3,
): Array<{ start: number; end: number; text: string }> {
  const onlyWords = words.filter((w) => w.type === 'word');
  if (onlyWords.length === 0) return [{ start: 0, end: totalDuration, text: '' }];

  const scenes: Array<{ start: number; end: number; text: string }> = [];
  let sceneStart = onlyWords[0].start;
  let sceneWords: string[] = [];

  for (let i = 0; i < onlyWords.length; i++) {
    const word = onlyWords[i];
    sceneWords.push(word.text);

    const elapsed = word.end - sceneStart;
    const isLast = i === onlyWords.length - 1;
    const nextWord = onlyWords[i + 1];

    // Check for sentence boundary: punctuation at end of word
    const endsWithPunctuation = /[.!?]$/.test(word.text);
    // Check for natural pause: >0.5s gap to next word
    const hasPause = nextWord && (nextWord.start - word.end) > 0.5;

    const shouldSplit =
      isLast ||
      (elapsed >= targetDuration && (endsWithPunctuation || hasPause)) ||
      (elapsed >= targetDuration * 1.5); // hard split at 1.5x target

    if (shouldSplit && elapsed >= minDuration) {
      scenes.push({
        start: Math.round(sceneStart * 100) / 100,
        end: Math.round(word.end * 100) / 100,
        text: sceneWords.join(' '),
      });
      sceneWords = [];
      if (nextWord) sceneStart = nextWord.start;
    }
  }

  // If no scenes were created (very short audio), use the whole thing
  if (scenes.length === 0) {
    scenes.push({
      start: 0,
      end: totalDuration,
      text: onlyWords.map((w) => w.text).join(' '),
    });
  }

  return scenes;
}

/**
 * Generate a thumbnail for a specific timestamp in a video.
 */
async function generateThumbnail(
  videoPath: string,
  timestamp: number,
  outputPath: string,
): Promise<string> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  try {
    await execFileAsync('ffmpeg', [
      '-y', '-ss', String(Math.max(0, timestamp)),
      '-i', videoPath,
      '-vframes', '1',
      '-vf', 'scale=180:-1',
      outputPath,
    ]);
    return outputPath;
  } catch {
    return '';
  }
}

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;

  const body = await request.json();
  const { videoPath, videoDuration } = body as { videoPath: string; videoDuration: number };

  if (!videoPath) {
    return NextResponse.json({ error: 'videoPath is required' }, { status: 400 });
  }

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

    // 2. Transcribe via ElevenLabs STT (get word-level timestamps)
    let transcription: { text: string; words: STTWord[] } | null = null;
    try {
      transcription = await transcribeAudio(audioPath);
    } catch (err: any) {
      console.warn('[longform-from-video] Transcription failed:', err.message);
    }

    // 3. Split into scenes by sentence boundaries (or fixed intervals as fallback)
    const totalDur = videoDuration || audioDuration;
    let rawScenes: Array<{ start: number; end: number; text: string }>;

    if (transcription?.words?.length) {
      rawScenes = splitBySentences(transcription.words, totalDur);
    } else {
      // Fallback: fixed 5-second intervals
      rawScenes = [];
      const segDur = 5;
      for (let t = 0; t < totalDur; t += segDur) {
        rawScenes.push({
          start: t,
          end: Math.min(t + segDur, totalDur),
          text: '',
        });
      }
    }

    if (rawScenes.length === 0) {
      rawScenes = [{ start: 0, end: totalDur, text: transcription?.text || '' }];
    }

    // 4. Generate thumbnails for each scene
    const thumbDir = path.join(tempDir, 'thumbs');
    const scenes = await Promise.all(
      rawScenes.map(async (scene, idx) => {
        const thumbPath = path.join(thumbDir, `thumb_${idx}.jpg`);
        const midpoint = scene.start + (scene.end - scene.start) / 2;
        const thumbResult = await generateThumbnail(localPath, midpoint, thumbPath);
        const thumbUrl = thumbResult && fsSync.existsSync(thumbResult)
          ? fileUrl(`uploads/lfv_${id}/thumbs/thumb_${idx}.jpg`)
          : '';

        return {
          id: `scene_${idx}`,
          order: idx,
          start: scene.start,
          end: scene.end,
          duration: Math.round((scene.end - scene.start) * 100) / 100,
          text: scene.text,
          thumbnail: thumbUrl,
          clipUrl: '',
          source: 'original' as const,
        };
      })
    );

    return NextResponse.json({
      audioUrl,
      audioDuration,
      fullTranscript: transcription?.text || '',
      scenes,
    });
  } catch (err: any) {
    try { await fs.rm(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
    return NextResponse.json({ error: err.message || 'Processing failed' }, { status: 500 });
  }
}
