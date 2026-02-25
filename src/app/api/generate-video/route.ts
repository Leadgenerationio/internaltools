import { NextRequest, NextResponse } from 'next/server';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { getVideoInfo } from '@/lib/get-video-info';
import { logger } from '@/lib/logger';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const maxDuration = 300; // 5 minutes — video generation can be slow

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_TIME_MS = 6 * 60 * 1000; // 6 minutes

export async function POST(request: NextRequest) {
  logger.info('Generate-video API called');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.error('GEMINI_API_KEY is not set');
    return NextResponse.json(
      { error: 'GEMINI_API_KEY environment variable is not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { prompt, count, aspectRatio, duration } = body;

    // Validate inputs
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }
    const videoCount = Math.min(Math.max(Number(count) || 1, 1), 4);
    const validAspectRatios = ['9:16', '16:9'];
    const ar = validAspectRatios.includes(aspectRatio) ? aspectRatio : '9:16';
    const validDurations = ['4', '6', '8'];
    const dur = validDurations.includes(String(duration)) ? String(duration) : '6';

    logger.info('Generate request', { prompt: prompt.slice(0, 100), count: videoCount, aspectRatio: ar, duration: dur });

    // Ensure upload directory exists
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Fire parallel generation calls
    const generatePromises = Array.from({ length: videoCount }, async (_, i) => {
      logger.info(`Starting generation ${i + 1}/${videoCount}`);

      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-generate-preview',
        prompt: prompt.trim(),
        config: {
          aspectRatio: ar,
          durationSeconds: Number(dur),
          numberOfVideos: 1,
        },
      });

      // Poll until done
      const startTime = Date.now();
      while (!operation.done) {
        if (Date.now() - startTime > MAX_POLL_TIME_MS) {
          throw new Error(`Video generation ${i + 1} timed out after 6 minutes`);
        }
        logger.debug(`Polling generation ${i + 1}...`);
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        operation = await ai.operations.getVideosOperation({ operation });
      }

      logger.info(`Generation ${i + 1} complete`);

      // Download the video
      const id = crypto.randomUUID();
      const filename = `${id}.mp4`;
      const filepath = path.join(UPLOAD_DIR, filename);

      const video = operation.response?.generatedVideos?.[0]?.video;
      if (!video) {
        throw new Error(`Generation ${i + 1} returned no video`);
      }

      await ai.files.download({ file: video, downloadPath: filepath });
      logger.info(`Downloaded video ${i + 1}`, { filepath });

      // Get video info
      const info = await getVideoInfo(filepath);

      // Generate thumbnail
      const thumbFilename = `${id}_thumb.jpg`;
      const thumbPath = path.join(UPLOAD_DIR, thumbFilename);
      try {
        await execAsync(
          `ffmpeg -y -i "${filepath}" -vframes 1 -ss 0 -vf "scale=180:-1" "${thumbPath}"`
        );
      } catch (e) {
        logger.warn('Thumbnail generation failed for generated video', { error: String(e) });
      }

      return {
        id,
        filename,
        originalName: `AI Generated ${i + 1}`,
        path: `/uploads/${filename}`,
        duration: info.duration,
        width: info.width,
        height: info.height,
        thumbnail: `/uploads/${thumbFilename}`,
      };
    });

    const videos = await Promise.all(generatePromises);

    logger.info('All generations complete', { count: videos.length });
    return NextResponse.json({ videos });
  } catch (error: any) {
    logger.error('Generate-video error', { error: error.message, stack: error.stack });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
