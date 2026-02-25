import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');

function isPathSafe(resolvedPath: string, allowedDir: string): boolean {
  const normalized = path.resolve(resolvedPath);
  return normalized.startsWith(path.resolve(allowedDir));
}

export async function GET() {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      return NextResponse.json({ logs: [], message: 'No logs yet' });
    }
    const files = fs.readdirSync(LOG_DIR)
      .filter((f) => f.endsWith('.log') && !f.includes('..') && !path.isAbsolute(f))
      .map((f) => {
        const fullPath = path.join(LOG_DIR, f);
        // Validate path stays within LOG_DIR
        if (!isPathSafe(fullPath, LOG_DIR)) return null;
        try {
          return { name: f, mtime: fs.statSync(fullPath).mtime.getTime() };
        } catch {
          return null;
        }
      })
      .filter((f): f is { name: string; mtime: number } => f !== null)
      .sort((a, b) => b.mtime - a.mtime);

    const today = new Date().toISOString().slice(0, 10);
    const todayFile = `app-${today}.log`;
    const logPath = path.join(LOG_DIR, todayFile);

    let content = '';

    // Read today's log if it exists and path is safe
    if (isPathSafe(logPath, LOG_DIR) && fs.existsSync(logPath)) {
      content = fs.readFileSync(logPath, 'utf-8');
    }

    // Fall back to most recent log file if today is empty
    if (!content && files[0]) {
      const fallbackPath = path.join(LOG_DIR, files[0].name);
      if (isPathSafe(fallbackPath, LOG_DIR)) {
        content = fs.readFileSync(fallbackPath, 'utf-8');
      }
    }

    const lines = content.trim().split('\n').filter(Boolean);
    const recent = lines.slice(-200); // last 200 lines

    return NextResponse.json({
      logs: recent,
      files: files.map((f) => f.name),
    });
  } catch (e) {
    return NextResponse.json({ logs: [], error: 'Failed to read logs' }, { status: 500 });
  }
}
