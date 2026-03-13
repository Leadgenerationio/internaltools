/**
 * FFmpeg video stitcher for the longform pipeline.
 *
 * Normalizes clips → concatenates → merges voiceover audio.
 * Target: 1080x1920 @ 30fps vertical (9:16).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execFileAsync = promisify(execFile);

const TARGET_WIDTH = 1080;
const TARGET_HEIGHT = 1920;
const TARGET_FPS = 30;
const FFMPEG_PRESET = 'medium';

const ASPECT_RATIO_MAP: Record<string, [number, number]> = {
  '9:16': [1080, 1920],
  '16:9': [1920, 1080],
  '1:1': [1080, 1080],
};

/**
 * Get duration of a media file in seconds.
 */
export async function getMediaDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    filePath,
  ]);
  const data = JSON.parse(stdout);
  return parseFloat(data.format.duration);
}

/**
 * Normalize a video clip to consistent resolution, fps, and codec.
 * Scales to fit within target resolution, pads with black if needed.
 * @param aspectRatio - Target aspect ratio (default: '9:16')
 */
export async function normalizeClip(
  inputPath: string,
  outputPath: string,
  aspectRatio?: string,
): Promise<string> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const [w, h] = ASPECT_RATIO_MAP[aspectRatio || '9:16'] || [TARGET_WIDTH, TARGET_HEIGHT];

  const filterStr = [
    `scale=${w}:${h}:force_original_aspect_ratio=decrease`,
    `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black`,
    `fps=${TARGET_FPS}`,
    'format=yuv420p',
  ].join(',');

  await execFileAsync('ffmpeg', [
    '-y', '-i', inputPath,
    '-vf', filterStr,
    '-c:v', 'libx264', '-preset', FFMPEG_PRESET,
    '-an', // strip audio — voiceover added separately
    outputPath,
  ]);

  return outputPath;
}

/**
 * Trim a clip to a specific duration.
 */
export async function trimClip(
  inputPath: string,
  outputPath: string,
  start: number,
  duration: number,
): Promise<string> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  await execFileAsync('ffmpeg', [
    '-y', '-ss', String(start),
    '-i', inputPath,
    '-t', String(duration),
    '-c', 'copy',
    outputPath,
  ]);

  return outputPath;
}

/**
 * Concatenate multiple normalized video clips into one.
 * All clips must have the same resolution and fps.
 */
export async function concatenateClips(
  clipPaths: string[],
  outputPath: string,
  tempDir: string,
): Promise<string> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const concatFile = path.join(tempDir, 'concat_list.txt');
  const lines = clipPaths.map((p) => `file '${path.resolve(p)}'`);
  await fs.writeFile(concatFile, lines.join('\n'));

  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'concat', '-safe', '0',
    '-i', concatFile,
    '-c', 'copy',
    outputPath,
  ]);

  return outputPath;
}

/**
 * Merge a video (no audio) with a voiceover audio track.
 * The video is looped to match the audio duration so the full voiceover plays.
 */
export async function mergeAudioVideo(
  videoPath: string,
  audioPath: string,
  outputPath: string,
): Promise<string> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const audioDuration = await getMediaDuration(audioPath);

  // -stream_loop -1 loops the video infinitely; -t caps at voiceover duration
  // Re-encode video because -stream_loop requires it (can't use -c:v copy)
  await execFileAsync('ffmpeg', [
    '-y',
    '-stream_loop', '-1',
    '-i', videoPath,
    '-i', audioPath,
    '-filter_complex',
    `[1:a]volume=1.0,atrim=0:${audioDuration},apad=whole_dur=${audioDuration}[a]`,
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'libx264', '-preset', FFMPEG_PRESET,
    '-c:a', 'aac', '-b:a', '192k',
    '-t', String(audioDuration),
    outputPath,
  ]);

  return outputPath;
}

/**
 * Mix background music into a video that already has voiceover audio.
 * Uses FFmpeg amix filter to blend the two audio tracks.
 */
export async function mixBackgroundMusic(params: {
  videoPath: string;
  musicPath: string;
  outputPath: string;
  musicVolume?: number; // 0-1, default 0.15
  fadeOutDuration?: number; // seconds, default 3
}): Promise<string> {
  const { videoPath, musicPath, outputPath, musicVolume = 0.15, fadeOutDuration = 3 } = params;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const videoDuration = await getMediaDuration(videoPath);

  // Music: set volume, fade out at end, trim to video duration
  const musicFilter = `[1:a]volume=${musicVolume},afade=t=out:st=${Math.max(0, videoDuration - fadeOutDuration)}:d=${fadeOutDuration},atrim=0:${videoDuration}[music]`;
  const mixFilter = `[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[out]`;

  await execFileAsync('ffmpeg', [
    '-y',
    '-i', videoPath,
    '-i', musicPath,
    '-filter_complex', `${musicFilter};${mixFilter}`,
    '-map', '0:v',
    '-map', '[out]',
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k',
    '-shortest',
    outputPath,
  ]);

  return outputPath;
}

/**
 * V2 assembly: combine scene clips + voiceover + optional music.
 * Supports parameterized aspect ratio.
 */
export async function assembleAdV2(params: {
  clips: string[];
  voiceoverPath: string;
  outputPath: string;
  tempDir: string;
  aspectRatio?: string;
  musicPath?: string;
  musicVolume?: number;
}): Promise<string> {
  const { clips, voiceoverPath, outputPath, tempDir, aspectRatio, musicPath, musicVolume } = params;

  await fs.mkdir(tempDir, { recursive: true });

  if (clips.length === 0) {
    throw new Error('No clips to assemble');
  }

  // 1. Normalize all clips to target aspect ratio
  const normalizedClips: string[] = [];
  for (let i = 0; i < clips.length; i++) {
    const normPath = path.join(tempDir, `norm_${i}.mp4`);
    await normalizeClip(clips[i], normPath, aspectRatio);
    normalizedClips.push(normPath);
  }

  // 2. Concatenate
  const concatPath = path.join(tempDir, 'concatenated.mp4');
  await concatenateClips(normalizedClips, concatPath, tempDir);

  // 3. Merge voiceover
  const withVoiceover = path.join(tempDir, 'with_voiceover.mp4');
  await mergeAudioVideo(concatPath, voiceoverPath, withVoiceover);

  // 4. Mix music if provided
  if (musicPath) {
    await mixBackgroundMusic({
      videoPath: withVoiceover,
      musicPath,
      outputPath,
      musicVolume,
    });
  } else {
    await fs.copyFile(withVoiceover, outputPath);
  }

  return outputPath;
}

/**
 * High-level assembly: combine hook + body clips + b-roll + voiceover into a raw ad.
 *
 * Structure:
 * 1. Hook clip (first ~5 seconds) — optional
 * 2. B-roll clips (matched to voiceover duration)
 * 3. Voiceover audio layered on top
 */
export async function assembleAd(params: {
  hookClipPath?: string;
  brollClips: string[];
  voiceoverPath: string;
  outputPath: string;
  tempDir: string;
  hookDuration?: number;
}): Promise<string> {
  const { hookClipPath, brollClips, voiceoverPath, outputPath, tempDir, hookDuration = 5 } = params;

  await fs.mkdir(tempDir, { recursive: true });
  const normalizedClips: string[] = [];
  let clipIndex = 0;

  // 1. Normalize and trim hook clip
  if (hookClipPath) {
    const normPath = path.join(tempDir, `norm_${clipIndex++}.mp4`);
    await normalizeClip(hookClipPath, normPath);
    const trimmedPath = path.join(tempDir, 'hook_trimmed.mp4');
    await trimClip(normPath, trimmedPath, 0, hookDuration);
    normalizedClips.push(trimmedPath);
  }

  // 2. Normalize b-roll clips
  for (const clip of brollClips) {
    const normPath = path.join(tempDir, `norm_${clipIndex++}.mp4`);
    await normalizeClip(clip, normPath);
    normalizedClips.push(normPath);
  }

  if (normalizedClips.length === 0) {
    throw new Error('No valid clips to assemble');
  }

  // 3. Concatenate all clips
  const rawConcatPath = path.join(tempDir, 'raw_concatenated.mp4');
  await concatenateClips(normalizedClips, rawConcatPath, tempDir);

  // 4. Merge voiceover audio
  await mergeAudioVideo(rawConcatPath, voiceoverPath, outputPath);

  return outputPath;
}
