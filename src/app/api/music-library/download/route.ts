import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getAuthContext } from '@/lib/api-auth';
import { fileUrl } from '@/lib/file-url';

const MUSIC_DIR = path.join(process.cwd(), 'public', 'music');
const JAMENDO_CLIENT_ID = process.env.JAMENDO_CLIENT_ID;

/**
 * POST /api/music-library/download
 * Downloads a Jamendo track to the server so it can be used in rendering.
 * Body: { trackId, downloadUrl, name, artist }
 */
export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;

  if (!JAMENDO_CLIENT_ID) {
    return NextResponse.json(
      { error: 'Music library not configured' },
      { status: 500 }
    );
  }

  let body: { trackId: string; downloadUrl: string; name: string; artist: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.trackId || !body.downloadUrl) {
    return NextResponse.json({ error: 'Missing trackId or downloadUrl' }, { status: 400 });
  }

  // Validate the URL is from Jamendo
  try {
    const url = new URL(body.downloadUrl);
    if (!url.hostname.endsWith('jamendo.com')) {
      return NextResponse.json({ error: 'Invalid download URL' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid download URL' }, { status: 400 });
  }

  const filename = `jamendo-${body.trackId}.mp3`;
  const filepath = path.join(MUSIC_DIR, filename);

  // Return cached file if already downloaded
  if (existsSync(filepath)) {
    return NextResponse.json({
      id: `jamendo-${body.trackId}`,
      name: `${body.name} — ${body.artist}`,
      path: fileUrl(`music/${filename}`),
    });
  }

  try {
    if (!existsSync(MUSIC_DIR)) {
      await mkdir(MUSIC_DIR, { recursive: true });
    }

    // Append client_id to download URL
    const downloadUrl = `${body.downloadUrl}${body.downloadUrl.includes('?') ? '&' : '?'}client_id=${JAMENDO_CLIENT_ID}`;

    const res = await fetch(downloadUrl);
    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to download track (${res.status})` },
        { status: 502 }
      );
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(filepath, buffer);

    return NextResponse.json({
      id: `jamendo-${body.trackId}`,
      name: `${body.name} — ${body.artist}`,
      path: fileUrl(`music/${filename}`),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to download track' },
      { status: 500 }
    );
  }
}
