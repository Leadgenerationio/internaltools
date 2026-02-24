/**
 * Get video metadata using ffprobe.
 * Kept separate from ffmpeg-renderer to avoid pulling in @napi-rs/canvas
 * (used only for rendering, not for upload metadata).
 */
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function getVideoInfo(filePath: string): Promise<{
  width: number;
  height: number;
  duration: number;
}> {
  const cmd = `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`;
  const { stdout } = await execAsync(cmd);
  const info = JSON.parse(stdout);

  const videoStream = info.streams.find((s: any) => s.codec_type === 'video');
  return {
    width: videoStream?.width || 360,
    height: videoStream?.height || 640,
    duration: parseFloat(info.format?.duration || '15'),
  };
}
