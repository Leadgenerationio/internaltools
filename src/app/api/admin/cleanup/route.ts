import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminContext } from '@/lib/admin-auth';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export const maxDuration = 60;

function cleanDirectory(dirPath: string, force: boolean, maxAgeMs: number): { deleted: number; bytes: number } {
  let deleted = 0;
  let bytes = 0;
  if (!fs.existsSync(dirPath)) return { deleted, bytes };

  const entries = fs.readdirSync(dirPath);
  const cutoff = Date.now() - maxAgeMs;

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    try {
      const stat = fs.statSync(fullPath);
      if (force || stat.mtimeMs < cutoff) {
        bytes += stat.isDirectory() ? 0 : stat.size;
        if (stat.isDirectory()) {
          fs.rmSync(fullPath, { recursive: true });
        } else {
          fs.unlinkSync(fullPath);
        }
        deleted++;
      }
    } catch (e) {
      console.warn('Failed to delete:', fullPath, e);
    }
  }
  return { deleted, bytes };
}

/**
 * GET /api/admin/cleanup — Check disk usage (read-only diagnostic).
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  if (key && key === process.env.AUTH_SECRET) {
    // Authorized
  } else {
    const ctx = await getSuperAdminContext();
    if (ctx.error) return ctx.error;
  }

  let diskInfo = '';
  try {
    diskInfo = execSync('df -h / 2>/dev/null').toString().trim();
    const dataDir = process.env.DATA_DIR;
    if (dataDir) {
      diskInfo += '\n\nVolume:\n' + execSync(`df -h "${dataDir}" 2>/dev/null`).toString().trim();
      diskInfo += '\n\nBreakdown:\n' + execSync(`du -sh "${dataDir}" "${dataDir}/uploads" "${dataDir}/outputs" "${dataDir}/music" 2>/dev/null`).toString().trim();
      diskInfo += '\n\nFile count:\n' + execSync(`find "${dataDir}" -type f 2>/dev/null | wc -l`).toString().trim() + ' files';
      diskInfo += '\n\nLargest files:\n' + execSync(`find "${dataDir}" -type f -exec du -h {} + 2>/dev/null | sort -rh | head -20`).toString().trim();
    }
  } catch { /* ignore */ }

  return NextResponse.json({ diskInfo });
}

/**
 * POST /api/admin/cleanup — Delete old output files to free disk space.
 * Auth: super admin session OR ?key=AUTH_SECRET query param.
 * Params: ?force=true (delete ALL files, not just old ones)
 */
export async function POST(request: NextRequest) {
  // Allow auth via query param for CLI/cron usage
  const key = request.nextUrl.searchParams.get('key');
  if (key && key === process.env.AUTH_SECRET) {
    // Authorized via secret key
  } else {
    const ctx = await getSuperAdminContext();
    if (ctx.error) return ctx.error;
  }

  const publicDir = path.join(process.cwd(), 'public');
  const outputsDir = path.join(publicDir, 'outputs');
  const uploadsDir = path.join(publicDir, 'uploads');
  const musicDir = path.join(publicDir, 'music');

  const force = request.nextUrl.searchParams.get('force') === 'true';
  const ONE_DAY = 24 * 60 * 60 * 1000;

  // Always delete all outputs (can always re-render)
  const outputs = cleanDirectory(outputsDir, true, 0);
  // Delete uploads: force=all, otherwise > 1 day old
  const uploads = cleanDirectory(uploadsDir, force, ONE_DAY);
  // Delete music: force=all, otherwise > 7 days old
  const music = cleanDirectory(musicDir, force, 7 * ONE_DAY);

  // Also clean DATA_DIR root if on Railway volume (stray temp files)
  let volumeStray = { deleted: 0, bytes: 0 };
  const dataDir = process.env.DATA_DIR;
  if (dataDir && fs.existsSync(dataDir)) {
    const entries = fs.readdirSync(dataDir);
    for (const entry of entries) {
      // Skip known subdirectories
      if (['uploads', 'outputs', 'music'].includes(entry)) continue;
      const fullPath = path.join(dataDir, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          volumeStray.bytes += stat.size;
          fs.unlinkSync(fullPath);
          volumeStray.deleted++;
        } else if (stat.isDirectory()) {
          fs.rmSync(fullPath, { recursive: true });
          volumeStray.deleted++;
        }
      } catch (e) {
        console.warn('Failed to delete stray volume file:', fullPath, e);
      }
    }
  }

  const totalBytes = outputs.bytes + uploads.bytes + music.bytes + volumeStray.bytes;
  const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);

  // Get disk usage info
  let diskInfo = '';
  try {
    diskInfo = execSync('df -h / 2>/dev/null | tail -1').toString().trim();
    if (dataDir) {
      diskInfo += '\n' + execSync(`df -h "${dataDir}" 2>/dev/null | tail -1`).toString().trim();
      diskInfo += '\n' + execSync(`du -sh "${dataDir}" "${dataDir}/uploads" "${dataDir}/outputs" "${dataDir}/music" 2>/dev/null`).toString().trim();
    }
  } catch { /* ignore */ }

  return NextResponse.json({
    message: `Cleaned up ${totalMB}MB`,
    outputs: { deleted: outputs.deleted, mb: (outputs.bytes / (1024 * 1024)).toFixed(1) },
    uploads: { deleted: uploads.deleted, mb: (uploads.bytes / (1024 * 1024)).toFixed(1) },
    music: { deleted: music.deleted, mb: (music.bytes / (1024 * 1024)).toFixed(1) },
    volumeStray: { deleted: volumeStray.deleted, mb: (volumeStray.bytes / (1024 * 1024)).toFixed(1) },
    diskInfo,
  });
}
