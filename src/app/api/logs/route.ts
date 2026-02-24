import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');

export async function GET() {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      return NextResponse.json({ logs: [], message: 'No logs yet' });
    }
    const files = fs.readdirSync(LOG_DIR)
      .filter((f) => f.endsWith('.log'))
      .map((f) => ({
        name: f,
        mtime: fs.statSync(path.join(LOG_DIR, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime);

    const today = new Date().toISOString().slice(0, 10);
    const todayFile = `app-${today}.log`;
    const logPath = path.join(LOG_DIR, todayFile);

    let content = '';
    if (fs.existsSync(logPath)) {
      content = fs.readFileSync(logPath, 'utf-8');
    }
    // Also append from any other recent files if today is empty
    if (!content && files[0]) {
      content = fs.readFileSync(path.join(LOG_DIR, files[0].name), 'utf-8');
    }

    const lines = content.trim().split('\n').filter(Boolean);
    const recent = lines.slice(-200); // last 200 lines

    return NextResponse.json({
      logs: recent,
      files: files.map((f) => f.name),
    });
  } catch (e) {
    return NextResponse.json({ logs: [], error: String(e) }, { status: 500 });
  }
}
