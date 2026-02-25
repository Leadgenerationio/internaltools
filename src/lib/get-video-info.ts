/**
 * Get video metadata using ffprobe.
 * Kept separate from ffmpeg-renderer to avoid pulling in @napi-rs/canvas
 * (used only for rendering, not for upload metadata).
 */
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

let ffmpegChecked = false;
let ffmpegAvailable = false;

export async function checkFfmpeg(): Promise<boolean> {
  if (ffmpegChecked) return ffmpegAvailable;
  try {
    await execAsync('ffmpeg -version');
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
  }
  ffmpegChecked = true;
  return ffmpegAvailable;
}

export async function getVideoInfo(filePath: string): Promise<{
  width: number;
  height: number;
  duration: number;
  codec: string;
  hasAudio: boolean;
}> {
  const hasFfmpeg = await checkFfmpeg();
  if (!hasFfmpeg) {
    throw new Error('FFmpeg/FFprobe not found. Install FFmpeg to use this app.');
  }

  const cmd = `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`;

  let stdout: string;
  try {
    const result = await execAsync(cmd);
    stdout = result.stdout;
  } catch (err: any) {
    throw new Error(`Failed to read video metadata: ${err.message}`);
  }

  let info: any;
  try {
    info = JSON.parse(stdout);
  } catch {
    throw new Error('FFprobe returned invalid data — file may be corrupted or unsupported.');
  }

  const videoStream = info.streams?.find((s: any) => s.codec_type === 'video');
  const audioStream = info.streams?.find((s: any) => s.codec_type === 'audio');

  if (!videoStream) {
    throw new Error('No video stream found in file. Is this a valid video?');
  }

  return {
    width: videoStream.width,
    height: videoStream.height,
    duration: parseFloat(info.format?.duration || videoStream.duration || '0'),
    codec: videoStream.codec_name || 'unknown',
    hasAudio: !!audioStream,
  };
}
