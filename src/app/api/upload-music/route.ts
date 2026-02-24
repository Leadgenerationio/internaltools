import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const MUSIC_DIR = path.join(process.cwd(), 'public', 'music');

export async function POST(request: NextRequest) {
  try {
    if (!existsSync(MUSIC_DIR)) {
      await mkdir(MUSIC_DIR, { recursive: true });
    }

    const formData = await request.formData();
    const file = formData.get('music') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const id = uuidv4();
    const ext = path.extname(file.name) || '.mp3';
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
