import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, statSync } from 'fs';
import { resolve, basename, join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { unlink } from 'fs/promises';

const execFileAsync = promisify(execFile);

const OUTPUTS_DIR = resolve(process.cwd(), 'public', 'outputs');

function isPathSafe(filePath: string, allowedDir: string): boolean {
  const resolved = resolve(filePath);
  return resolved.startsWith(resolve(allowedDir));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const files: { url: string; name: string }[] = body.files;

    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    if (files.length > 100) {
      return NextResponse.json({ error: 'Too many files (max 100)' }, { status: 400 });
    }

    // Resolve all file paths and validate they're in the outputs directory
    const resolvedPaths: { path: string; name: string }[] = [];
    for (const file of files) {
      // URL is like /outputs/filename.mp4 — strip leading slash and resolve
      const relativePath = file.url.replace(/^\//, '');
      const fullPath = resolve(process.cwd(), 'public', relativePath);

      if (!isPathSafe(fullPath, OUTPUTS_DIR)) {
        return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
      }

      try {
        statSync(fullPath);
      } catch {
        continue; // Skip missing files
      }

      resolvedPaths.push({ path: fullPath, name: file.name });
    }

    if (resolvedPaths.length === 0) {
      return NextResponse.json({ error: 'No valid files found' }, { status: 404 });
    }

    // Create ZIP using system zip command
    const zipName = `ad-videos-${uuidv4().slice(0, 8)}.zip`;
    const zipPath = join(OUTPUTS_DIR, zipName);

    // Use zip with -j to strip directory paths
    const args = ['-j', zipPath, ...resolvedPaths.map((f) => f.path)];
    await execFileAsync('zip', args);

    // Read the ZIP and stream it back
    const stat = statSync(zipPath);
    const stream = createReadStream(zipPath);

    // Clean up the ZIP file after a delay
    setTimeout(async () => {
      try { await unlink(zipPath); } catch { /* ignore */ }
    }, 60_000);

    // Convert Node stream to Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk) => controller.enqueue(chunk));
        stream.on('end', () => controller.close());
        stream.on('error', (err) => controller.error(err));
      },
    });

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipName}"`,
        'Content-Length': stat.size.toString(),
      },
    });
  } catch (err: any) {
    console.error('ZIP creation failed:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to create ZIP' },
      { status: 500 }
    );
  }
}
