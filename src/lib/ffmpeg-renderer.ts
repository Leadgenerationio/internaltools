import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { TextOverlay, MusicTrack } from './types';
import { renderOverlayToPng, getOverlayHeight } from './overlay-renderer';
const execFileAsync = promisify(execFile);

const ALLOWED_DIRS = [
  path.join(process.cwd(), 'public'),
  path.join(process.cwd(), 'logs'),
];

function isPathSafe(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  return ALLOWED_DIRS.some((dir) => resolved.startsWith(path.resolve(dir)));
}

async function hasAudioStream(filePath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-select_streams', 'a',
      '-show_entries', 'stream=codec_type',
      '-of', 'csv=p=0',
      filePath,
    ]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

// 9:16 Reels output size (vertical, standard for Instagram/TikTok/Facebook Reels)
const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;

/**
 * Core FFmpeg renderer that composites text overlays onto video
 *
 * FFmpeg's drawtext doesn't support emoji (shows square placeholders).
 * We render overlays to PNG using @napi-rs/canvas with emoji fonts, then
 * use FFmpeg's overlay filter to composite them onto the video.
 */

export type RenderQuality = 'draft' | 'final';

export interface RenderOptions {
  inputVideoPath: string;
  outputPath: string;
  overlays: TextOverlay[];
  music?: MusicTrack | null;
  videoWidth: number;
  videoHeight: number;
  videoDuration: number;
  trimStart?: number;
  trimEnd?: number;
  quality?: RenderQuality;
  onProgress?: (percent: number) => void;
}

/**
 * Render a single video with text overlays and optional music
 */
export async function renderVideo(options: RenderOptions): Promise<string> {
  const {
    inputVideoPath,
    outputPath,
    overlays,
    music,
    videoDuration,
    trimStart,
    trimEnd,
    quality = 'final',
  } = options;

  const hasTrim = (trimStart !== undefined && trimStart > 0) || (trimEnd !== undefined && trimEnd < videoDuration);

  // Quality settings: draft = fast encode, lower quality; final = high quality
  const preset = quality === 'draft' ? 'ultrafast' : 'fast';
  const crf = quality === 'draft' ? '28' : '23';

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const scaleCrop = `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase,crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`;

  // Render each overlay to PNG (with emoji support via canvas)
  const tempDir = path.join(outputDir, `overlays_${uuidv4()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const overlayPaths: string[] = [];

  try {
    const sorted = [...overlays].sort((a, b) => a.startTime - b.startTime);

    for (let i = 0; i < sorted.length; i++) {
      const overlay = sorted[i];
      const pngPath = path.join(tempDir, `overlay_${i}.png`);
      await renderOverlayToPng(overlay, OUTPUT_WIDTH, OUTPUT_HEIGHT, pngPath);
      overlayPaths.push(pngPath);
    }

    // Build overlay filter chain
    const firstOverlayIndex = music && fs.existsSync(music.file) ? 2 : 1;

    const overlayFilterParts: string[] = [];
    let prevLabel = '[base]';

    // Safe zone: 15% from top, 35% from bottom (Facebook/Instagram Reels/Stories UI)
    const SAFE_TOP = Math.round(OUTPUT_HEIGHT * 0.15);
    const SAFE_BOTTOM = Math.round(OUTPUT_HEIGHT * 0.65); // bottom of last overlay must stay above this
    const safeZoneHeight = SAFE_BOTTOM - SAFE_TOP;

    // Calculate total stacked height of all overlays (including gaps)
    const overlayHeights = sorted.map((o) => getOverlayHeight(o, OUTPUT_WIDTH));
    const totalHeight = overlayHeights.reduce((sum, h) => sum + h, 0);

    // If overlays overflow the safe zone, compress spacing proportionally to fit
    const scale = totalHeight > safeZoneHeight ? safeZoneHeight / totalHeight : 1;

    let currentY = SAFE_TOP;

    sorted.forEach((overlay, index) => {
      const inputIndex = firstOverlayIndex + index;
      const yPos = Math.round(currentY);

      // Advance by this overlay's height (compressed if needed)
      currentY += overlayHeights[index] * scale;

      const nextLabel = index === sorted.length - 1 ? '[outv]' : `[v${index}]`;
      // Round times to avoid float precision issues in FFmpeg filter strings
      const startT = Math.round(overlay.startTime * 1000) / 1000;
      const endT = Math.round(overlay.endTime * 1000) / 1000;
      overlayFilterParts.push(
        `${prevLabel}[${inputIndex}:v]overlay=x=(main_w-overlay_w)/2:y=${yPos}:enable='between(t,${startT},${endT})'${nextLabel}`
      );
      prevLabel = nextLabel;
    });

    const videoFilter =
      overlayFilterParts.length > 0
        ? `[0:v]${scaleCrop}[base];` + overlayFilterParts.join(';')
        : `[0:v]${scaleCrop}[outv]`;

    // Build FFmpeg args as an array (no shell interpolation)
    // Limit threads to reduce memory usage on constrained containers (Railway)
    const args: string[] = ['-y', '-threads', '2'];

    // Trim: seek to start time before input for efficiency
    if (hasTrim && trimStart && trimStart > 0) {
      args.push('-ss', String(trimStart));
    }

    // Input files
    args.push('-i', inputVideoPath);

    // Trim: limit duration
    if (hasTrim) {
      const effectiveDuration = (trimEnd ?? videoDuration) - (trimStart ?? 0);
      args.push('-t', String(effectiveDuration));
    }

    if (music && fs.existsSync(music.file)) {
      args.push('-i', music.file);
    }

    for (const p of overlayPaths) {
      args.push('-i', p);
    }

    if (music && fs.existsSync(music.file)) {
      const musicVolume = music.volume ?? 1;
      const fadeOutDuration = Math.min(music.fadeOut || 2, videoDuration);
      const fadeOutStart = Math.max(0, videoDuration - fadeOutDuration);
      const videoHasAudio = await hasAudioStream(inputVideoPath);

      const musicFilter = `[1:a]volume=${musicVolume},afade=t=in:d=${music.fadeIn || 1},afade=t=out:st=${fadeOutStart}:d=${fadeOutDuration}[musicout]`;
      const audioMixFilter = videoHasAudio
        ? `[0:a][musicout]amix=inputs=2:duration=first:dropout_transition=2[outa]`
        : `[musicout]atrim=duration=${videoDuration},apad=whole_dur=${videoDuration}[outa]`;

      const filterComplex = [videoFilter, musicFilter, audioMixFilter].join(';');

      args.push('-filter_complex', filterComplex);
      args.push('-map', '[outv]', '-map', '[outa]');
      args.push('-c:v', 'libx264', '-preset', preset, '-crf', crf, '-x264-params', 'threads=2');
      args.push('-c:a', 'aac', '-b:a', '192k');
      args.push('-movflags', '+faststart');
      args.push('-t', String(videoDuration));
    } else {
      args.push('-filter_complex', videoFilter);
      args.push('-map', '[outv]');
      args.push('-c:v', 'libx264', '-preset', preset, '-crf', crf, '-x264-params', 'threads=2');

      // Only include source audio if the video actually has an audio stream
      const videoHasAudio = await hasAudioStream(inputVideoPath);
      if (videoHasAudio) {
        args.push('-map', '0:a');
        args.push('-c:a', 'copy');
      }

      args.push('-movflags', '+faststart');
    }

    args.push(outputPath);

    console.log('FFmpeg args:', args.join(' '));

    const { stdout, stderr } = await execFileAsync('ffmpeg', args, { maxBuffer: 1024 * 1024 * 10 });
    console.log('FFmpeg stdout:', stdout);
    if (stderr) console.log('FFmpeg stderr:', stderr);
    return outputPath;
  } finally {
    // Clean up temp overlay PNGs — validate path is within allowed dirs
    try {
      if (fs.existsSync(tempDir) && isPathSafe(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
    } catch (e) {
      console.warn('Failed to clean up temp overlay files:', e);
    }
  }
}

/**
 * Batch render: apply same overlays + music to multiple videos
 */
export async function batchRender(
  videoPaths: { inputPath: string; outputPath: string; width: number; height: number; duration: number; trimStart?: number; trimEnd?: number }[],
  overlays: TextOverlay[],
  music: MusicTrack | null,
  onJobProgress?: (videoIndex: number, percent: number) => void,
  quality?: RenderQuality,
): Promise<string[]> {
  const results: string[] = [];

  for (let i = 0; i < videoPaths.length; i++) {
    const video = videoPaths[i];
    const output = await renderVideo({
      inputVideoPath: video.inputPath,
      outputPath: video.outputPath,
      overlays,
      music,
      videoWidth: video.width,
      videoHeight: video.height,
      videoDuration: video.duration,
      trimStart: video.trimStart,
      trimEnd: video.trimEnd,
      quality,
      onProgress: (p) => onJobProgress?.(i, p),
    });
    results.push(output);
  }

  return results;
}
