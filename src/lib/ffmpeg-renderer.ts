import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { TextOverlay, MusicTrack } from './types';
import { renderOverlayToPng, getOverlayHeight } from './overlay-renderer';
const execAsync = promisify(exec);

async function hasAudioStream(filePath: string): Promise<boolean> {
  try {
    const cmd = `ffprobe -v quiet -select_streams a -show_entries stream=codec_type -of csv=p=0 "${filePath}"`;
    const { stdout } = await execAsync(cmd);
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

export interface RenderOptions {
  inputVideoPath: string;
  outputPath: string;
  overlays: TextOverlay[];
  music?: MusicTrack | null;
  videoWidth: number;
  videoHeight: number;
  videoDuration: number;
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
  } = options;

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
    const overlayInputs = overlayPaths.map((p) => `-i "${p}"`).join(' ');
    const firstOverlayIndex = music && fs.existsSync(music.file) ? 2 : 1;

    const overlayFilterParts: string[] = [];
    let prevLabel = '[base]';

    sorted.forEach((overlay, index) => {
      const inputIndex = firstOverlayIndex + index;
      let yPos = Math.round(OUTPUT_HEIGHT * 0.08);
      for (let j = 0; j < index; j++) {
        yPos += getOverlayHeight(sorted[j], OUTPUT_WIDTH);
      }
      const nextLabel = index === sorted.length - 1 ? '[outv]' : `[v${index}]`;
      overlayFilterParts.push(
        `${prevLabel}[${inputIndex}:v]overlay=x=(main_w-overlay_w)/2:y=${yPos}:enable='between(t,${overlay.startTime},${overlay.endTime})'${nextLabel}`
      );
      prevLabel = nextLabel;
    });

    const videoFilter =
      overlayFilterParts.length > 0
        ? `[0:v]${scaleCrop}[base];` + overlayFilterParts.join(';')
        : `[0:v]${scaleCrop}[outv]`;

    let cmd: string;

    if (music && fs.existsSync(music.file)) {
      const musicVolume = music.volume ?? 1;
      const fadeOutDuration = Math.min(music.fadeOut || 2, videoDuration);
      const fadeOutStart = Math.max(0, videoDuration - fadeOutDuration);
      const videoHasAudio = await hasAudioStream(inputVideoPath);

      const musicFilter = `[1:a]volume=${musicVolume},afade=t=in:d=${music.fadeIn || 1},afade=t=out:st=${fadeOutStart}:d=${fadeOutDuration}[musicout]`;
      const audioMixFilter = videoHasAudio
        ? `[0:a][musicout]amix=inputs=2:duration=first:dropout_transition=2[outa]`
        : `[musicout]atrim=duration=${videoDuration},apad=whole_dur=${videoDuration}[outa]`;

      cmd = [
        `ffmpeg -y`,
        `-i "${inputVideoPath}"`,
        `-i "${music.file}"`,
        overlayInputs,
        `-filter_complex "`,
        videoFilter + ';',
        musicFilter + ';',
        audioMixFilter + '"',
        `-map "[outv]" -map "[outa]"`,
        `-c:v libx264 -preset fast -crf 23`,
        `-c:a aac -b:a 192k`,
        `-movflags +faststart`,
        `-t ${videoDuration}`,
        `"${outputPath}"`,
      ].join(' ');
    } else {
      cmd = [
        `ffmpeg -y`,
        `-i "${inputVideoPath}"`,
        overlayInputs,
        `-filter_complex "${videoFilter}"`,
        `-map "[outv]"`,
        `-c:v libx264 -preset fast -crf 23`,
        `-c:a copy`,
        `-movflags +faststart`,
        `"${outputPath}"`,
      ].join(' ');
    }

    console.log('FFmpeg command:', cmd);

    const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 1024 * 1024 * 50 });
    console.log('FFmpeg stdout:', stdout);
    if (stderr) console.log('FFmpeg stderr:', stderr);
    return outputPath;
  } finally {
    // Clean up temp overlay PNGs
    try {
      if (fs.existsSync(tempDir)) {
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
  videoPaths: { inputPath: string; outputPath: string; width: number; height: number; duration: number }[],
  overlays: TextOverlay[],
  music: MusicTrack | null,
  onJobProgress?: (videoIndex: number, percent: number) => void,
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
      onProgress: (p) => onJobProgress?.(i, p),
    });
    results.push(output);
  }

  return results;
}

