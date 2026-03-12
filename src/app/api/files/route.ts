import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { stat } from 'fs/promises';
import { createReadStream } from 'fs';

const PUBLIC_DIR = path.join(process.cwd(), 'public');

// Allowed subdirectories — prevent directory traversal
const ALLOWED_DIRS = ['uploads', 'outputs', 'music'];

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
};

export async function GET(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get('path');
  if (!filePath) {
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
  }

  // Normalize and validate path
  const normalized = path.normalize(filePath).replace(/^\/+/, '');
  const firstDir = normalized.split('/')[0];

  if (!ALLOWED_DIRS.includes(firstDir)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const fullPath = path.join(PUBLIC_DIR, normalized);

  // Prevent directory traversal
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const ext = path.extname(fullPath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  // Try local file first
  try {
    const fileStat = await stat(fullPath);
    if (fileStat.isFile()) {
      return serveLocalFile(request, fullPath, contentType, fileStat.size);
    }
  } catch {
    // File not on local disk — try S3 fallback
  }

  // Fallback: fetch from S3 if cloud storage is configured
  return serveFromS3(normalized, contentType);
}

/**
 * Serve a local file with Range header support.
 */
function serveLocalFile(
  request: NextRequest,
  fullPath: string,
  contentType: string,
  fileSize: number,
): NextResponse {
  const rangeHeader = request.headers.get('range');

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (!match) {
      return new NextResponse(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${fileSize}` },
      });
    }

    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize || start > end) {
      return new NextResponse(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${fileSize}` },
      });
    }

    const chunkSize = end - start + 1;
    const nodeStream = createReadStream(fullPath, { start, end });
    const webStream = nodeStreamToWeb(nodeStream);

    return new NextResponse(webStream, {
      status: 206,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(chunkSize),
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  const nodeStream = createReadStream(fullPath);
  const webStream = nodeStreamToWeb(nodeStream);

  return new NextResponse(webStream, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(fileSize),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

/**
 * Fetch a file from S3 and proxy it back to the client.
 * Used when the file doesn't exist on local disk (e.g., worker uploaded to S3).
 */
async function serveFromS3(storagePath: string, contentType: string): Promise<NextResponse> {
  const bucket = process.env.S3_BUCKET;
  const endpoint = process.env.S3_ENDPOINT;
  const accessKey = process.env.S3_ACCESS_KEY_ID;
  const secretKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!bucket || !endpoint || !accessKey || !secretKey) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      endpoint,
      region: process.env.S3_REGION || 'auto',
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      forcePathStyle: true,
    });

    const response = await client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: storagePath,
    }));

    if (!response.Body) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Convert S3 body stream to web ReadableStream
    const webStream = response.Body.transformToWebStream();

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': contentType,
        ...(response.ContentLength ? { 'Content-Length': String(response.ContentLength) } : {}),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

/**
 * Convert a Node.js Readable stream to a Web ReadableStream.
 */
function nodeStreamToWeb(nodeStream: ReturnType<typeof createReadStream>): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer | string) => {
        const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        controller.enqueue(new Uint8Array(buf));
      });
      nodeStream.on('end', () => {
        controller.close();
      });
      nodeStream.on('error', (err) => {
        controller.error(err);
      });
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}
