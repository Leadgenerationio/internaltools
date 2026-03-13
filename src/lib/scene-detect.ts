/**
 * FFmpeg-based scene detection and video splitting.
 *
 * Uses FFmpeg's `select` filter with scene change detection to identify
 * cut points in a video, then splits into individual clips.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { getVideoInfo } from '@/lib/get-video-info';
import { fileUrl } from '@/lib/file-url';

const execFileAsync = promisify(execFile);

export interface DetectedSegment {
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
  thumbnailUrl: string;
}

/**
 * Detect scene changes in a video using FFmpeg's scene filter.
 *
 * @param filePath Absolute path to the video file
 * @param threshold Scene change sensitivity (0.0-1.0). Lower = more cuts. Default 0.3
 * @param minSegmentDuration Minimum segment length in seconds. Default 1.0
 * @returns Array of detected segments with timestamps and thumbnails
 */
export async function detectScenes(
  filePath: string,
  threshold = 0.3,
  minSegmentDuration = 1.0,
): Promise<DetectedSegment[]> {
  const info = await getVideoInfo(filePath);
  const totalDuration = info.duration;

  if (totalDuration < 2) {
    // Too short to split — return the whole video as one segment
    return [{
      index: 0,
      startTime: 0,
      endTime: totalDuration,
      duration: totalDuration,
      thumbnailUrl: '',
    }];
  }

  // Run FFmpeg scene detection — outputs scene change timestamps via showinfo
  const { stderr } = await execFileAsync('ffmpeg', [
    '-i', filePath,
    '-filter:v', `select='gt(scene,${threshold})',showinfo`,
    '-f', 'null',
    '-',
  ], { maxBuffer: 10 * 1024 * 1024, timeout: 120_000 });

  // Parse pts_time from showinfo output lines
  const sceneTimestamps: number[] = [];
  const lines = stderr.split('\n');
  for (const line of lines) {
    if (line.includes('showinfo') && line.includes('pts_time:')) {
      const match = line.match(/pts_time:\s*([\d.]+)/);
      if (match) {
        const t = parseFloat(match[1]);
        if (!isNaN(t) && t > 0 && t < totalDuration) {
          sceneTimestamps.push(t);
        }
      }
    }
  }

  // Build segments from scene change points
  const cutPoints = [0, ...sceneTimestamps, totalDuration];

  // Deduplicate and sort
  const uniqueCuts = [...new Set(cutPoints)].sort((a, b) => a - b);

  // Merge segments that are too short
  const mergedCuts: number[] = [uniqueCuts[0]];
  for (let i = 1; i < uniqueCuts.length; i++) {
    const last = mergedCuts[mergedCuts.length - 1];
    if (uniqueCuts[i] - last >= minSegmentDuration) {
      mergedCuts.push(uniqueCuts[i]);
    }
  }
  // Ensure last cut point is the total duration
  if (mergedCuts[mergedCuts.length - 1] !== totalDuration) {
    mergedCuts.push(totalDuration);
  }

  const segments: DetectedSegment[] = [];
  for (let i = 0; i < mergedCuts.length - 1; i++) {
    const start = mergedCuts[i];
    const end = mergedCuts[i + 1];
    segments.push({
      index: i,
      startTime: Math.round(start * 1000) / 1000,
      endTime: Math.round(end * 1000) / 1000,
      duration: Math.round((end - start) * 1000) / 1000,
      thumbnailUrl: '', // Generated below
    });
  }

  return segments;
}

/**
 * Generate thumbnails for detected segments.
 * Each thumbnail is captured at the midpoint of the segment.
 */
export async function generateSegmentThumbnails(
  filePath: string,
  segments: DetectedSegment[],
  outputDir: string,
  fileId: string,
): Promise<DetectedSegment[]> {
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  const results = await Promise.allSettled(
    segments.map(async (seg) => {
      const midpoint = seg.startTime + seg.duration / 2;
      const thumbFilename = `${fileId}_seg${seg.index}_thumb.jpg`;
      const thumbPath = path.join(outputDir, thumbFilename);

      await execFileAsync('ffmpeg', [
        '-y',
        '-ss', String(midpoint),
        '-i', filePath,
        '-vframes', '1',
        '-vf', 'scale=320:-1',
        thumbPath,
      ], { timeout: 15_000 });

      return {
        ...seg,
        thumbnailUrl: fileUrl(`uploads/${thumbFilename}`),
      };
    }),
  );

  return results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : segments[i],
  );
}

/**
 * Split a video into a clip at the given time range.
 * Uses stream copy for speed — no re-encoding.
 */
export async function splitClip(
  inputPath: string,
  startTime: number,
  endTime: number,
  outputPath: string,
): Promise<void> {
  const duration = endTime - startTime;

  await execFileAsync('ffmpeg', [
    '-y',
    '-ss', String(startTime),
    '-i', inputPath,
    '-t', String(duration),
    '-c', 'copy',
    '-avoid_negative_ts', 'make_zero',
    outputPath,
  ], { timeout: 60_000 });
}
