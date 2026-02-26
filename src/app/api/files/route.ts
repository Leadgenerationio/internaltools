import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { readFile, stat } from 'fs/promises';

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

  try {
    const fileStat = await stat(fullPath);
    if (!fileStat.isFile()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const data = await readFile(fullPath);

    return new NextResponse(data, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(fileStat.size),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
