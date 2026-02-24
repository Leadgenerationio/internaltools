import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getVideoInfo } from '@/lib/get-video-info';
import { logger } from '@/lib/logger';

export const maxDuration = 60;

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

export async function POST(request: NextRequest) {
  logger.info('Upload API called', { contentType: request.headers.get('content-type') });
  try {
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
      logger.info('Created upload dir', { dir: UPLOAD_DIR });
    }

    logger.debug('Parsing formData...');
    const formData = await request.formData();
    const files = formData.getAll('videos') as File[];

    logger.info('FormData parsed', { fileCount: files?.length ?? 0, keys: [...formData.keys()] });

    if (!files || files.length === 0) {
      logger.warn('No files in upload', { formDataKeys: [...formData.keys()] });
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    const uploaded = [];

    for (const file of files) {
      const id = uuidv4();
      const ext = path.extname(file.name) || '.mp4';
      const filename = `${id}${ext}`;
      const filepath = path.join(UPLOAD_DIR, filename);

      logger.info('Processing file', { name: file.name, size: file.size, filename });

      const bytes = await file.arrayBuffer();
      logger.debug('File read', { bytes: bytes.byteLength });
      await writeFile(filepath, Buffer.from(bytes));
      logger.debug('File written', { filepath });

      const info = await getVideoInfo(filepath);
      logger.debug('Video info', { info });

      // Generate thumbnail
      const thumbFilename = `${id}_thumb.jpg`;
      const thumbPath = path.join(UPLOAD_DIR, thumbFilename);
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      try {
        await execAsync(
          `ffmpeg -y -i "${filepath}" -vframes 1 -ss 0 -vf "scale=180:-1" "${thumbPath}"`
        );
      } catch (e) {
        console.error('Thumbnail generation failed:', e);
      }

      uploaded.push({
        id,
        filename,
        originalName: file.name,
        path: `/uploads/${filename}`,
        duration: info.duration,
        width: info.width,
        height: info.height,
        thumbnail: `/uploads/${thumbFilename}`,
      });
    }

    logger.info('Upload complete', { count: uploaded.length });
    return NextResponse.json({ videos: uploaded });
  } catch (error: any) {
    logger.error('Upload error', { error: error.message, stack: error.stack });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
