/**
 * POST /api/internal/upload-output
 *
 * Internal endpoint for the worker service to upload finished output files
 * to the web app's persistent volume. Authenticated via AUTH_SECRET header.
 *
 * The worker and web app run as separate Railway services with separate filesystems,
 * so the worker must upload output files here for the web app to serve them.
 */

import { NextRequest, NextResponse } from 'next/server';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'outputs');

export async function POST(request: NextRequest) {
  // Auth: require AUTH_SECRET as bearer token (internal service-to-service)
  const authHeader = request.headers.get('authorization');
  const expectedToken = process.env.AUTH_SECRET;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const filename = request.headers.get('x-filename');
  if (!filename || filename.includes('..') || filename.includes('/')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const body = request.body;
  if (!body) {
    return NextResponse.json({ error: 'No body' }, { status: 400 });
  }

  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const outputPath = path.join(OUTPUT_DIR, filename);

    const nodeStream = Readable.fromWeb(body as any);
    await pipeline(nodeStream, createWriteStream(outputPath));

    return NextResponse.json({ ok: true, path: `outputs/${filename}` });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
