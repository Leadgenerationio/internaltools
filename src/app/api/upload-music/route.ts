import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getAuthContext } from '@/lib/api-auth';

const MUSIC_DIR = path.join(process.cwd(), 'public', 'music');
const MAX_MUSIC_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_EXTENSIONS = ['.mp3', '.wav', '.aac', '.m4a', '.ogg', '.flac'];

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;

  try {
    if (!existsSync(MUSIC_DIR)) {
      await mkdir(MUSIC_DIR, { recursive: true });
    }

    const formData = await request.formData();
    const file = formData.get('music') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (file.size > MAX_MUSIC_SIZE) {
      const sizeMB = Math.round(file.size / 1024 / 1024);
      return NextResponse.json(
        { error: `Music file is ${sizeMB}MB — max is ${MAX_MUSIC_SIZE / 1024 / 1024}MB.` },
        { status: 413 }
      );
    }

    const ext = path.extname(file.name).toLowerCase() || '.mp3';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: `Unsupported audio format "${ext}". Use: ${ALLOWED_EXTENSIONS.join(', ')}` },
        { status: 400 }
      );
    }

    const id = uuidv4();
    const filename = `${id}${ext}`;
    const filepath = path.join(MUSIC_DIR, filename);

    const bytes = await file.arrayBuffer();
    await writeFile(filepath, Buffer.from(bytes));

    return NextResponse.json({
      id,
      name: file.name,
      path: `/music/${filename}`,
    });
  } catch (error: any) {
    console.error('Music upload error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
