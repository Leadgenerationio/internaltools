import { NextRequest, NextResponse } from 'next/server';
import { mkdir } from 'fs/promises';
import fs, { existsSync } from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getVideoInfo } from '@/lib/get-video-info';
import { logger } from '@/lib/logger';
import { getAuthContext } from '@/lib/api-auth';
import { fileUrl } from '@/lib/file-url';

const execFileAsync = promisify(execFile);

export const maxDuration = 60;

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const ALLOWED_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v', '.wmv']);

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;

  logger.info('Upload API called', { contentType: request.headers.get('content-type') });
  try {
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
      logger.info('Created upload dir', { dir: UPLOAD_DIR });
    }

    logger.debug('Parsing formData...');
    const formData = await request.formData();
    const files = formData.getAll('videos') as File[];

    logger.info('FormData parsed', { fileCount: files?.length ?? 0, keys: Array.from(formData.keys()) });

    if (!files || files.length === 0) {
      logger.warn('No files in upload', { formDataKeys: Array.from(formData.keys()) });
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    // Validate file sizes upfront
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        const sizeMB = Math.round(file.size / 1024 / 1024);
        return NextResponse.json(
          { error: `"${file.name}" is ${sizeMB}MB — max file size is ${MAX_FILE_SIZE / 1024 / 1024}MB.` },
          { status: 413 }
        );
      }
    }

    const uploaded = [];
    const writtenFiles: string[] = []; // Track for cleanup on failure

    for (const file of files) {
      const id = uuidv4();
      const ext = (path.extname(file.name) || '.mp4').toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return NextResponse.json(
          { error: `"${file.name}" has unsupported format. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}` },
          { status: 400 }
        );
      }
      const filename = `${id}${ext}`;
      const filepath = path.join(UPLOAD_DIR, filename);

      logger.info('Processing file', { name: file.name, size: file.size, filename });

      // Stream file to disk instead of buffering in memory
      const readable = Readable.fromWeb(file.stream() as any);
      const writable = fs.createWriteStream(filepath);
      await pipeline(readable, writable);
      writtenFiles.push(filepath);
      logger.debug('File streamed to disk', { filepath });

      let info;
      try {
        info = await getVideoInfo(filepath);
      } catch (err: any) {
        logger.error('Video info failed', { file: file.name, error: err.message });
        // Clean up all files written so far
        for (const f of writtenFiles) {
          try { fs.unlinkSync(f); } catch { /* ignore */ }
        }
        return NextResponse.json(
          { error: `"${file.name}" could not be read — ${err.message}` },
          { status: 400 }
        );
      }

      logger.debug('Video info', { info });

      // Generate thumbnail
      const thumbFilename = `${id}_thumb.jpg`;
      const thumbPath = path.join(UPLOAD_DIR, thumbFilename);

      try {
        await execFileAsync('ffmpeg', [
          '-y', '-i', filepath,
          '-vframes', '1', '-ss', '0',
          '-vf', 'scale=180:-1',
          thumbPath,
        ]);
        writtenFiles.push(thumbPath);
      } catch (e: any) {
        logger.warn('Thumbnail generation failed', { file: file.name, error: e.message });
      }

      uploaded.push({
        id,
        filename,
        originalName: file.name,
        path: fileUrl(`uploads/${filename}`),
        duration: info.duration,
        width: info.width,
        height: info.height,
        thumbnail: existsSync(thumbPath) ? fileUrl(`uploads/${thumbFilename}`) : '',
      });
    }

    logger.info('Upload complete', { count: uploaded.length });
    return NextResponse.json({ videos: uploaded });
  } catch (error: any) {
    logger.error('Upload error', { error: error.message, stack: error.stack });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
