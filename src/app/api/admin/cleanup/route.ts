import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminContext } from '@/lib/admin-auth';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';

/** Safe shell-free exec — returns stdout or empty string on failure. */
function safeExec(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { stdio: ['pipe', 'pipe', 'ignore'], timeout: 10_000 }).toString().trim();
  } catch {
    return '';
  }
}

/** Count files recursively in a directory. */
function countFiles(dirPath: string): number {
  let count = 0;
  try {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (entry.isFile()) count++;
      else if (entry.isDirectory()) count += countFiles(path.join(dirPath, entry.name));
    }
  } catch { /* ignore */ }
  return count;
}

/** Find the N largest files in a directory, sorted by size descending. */
function findLargestFiles(dirPath: string, limit: number): { path: string; size: number }[] {
  const files: { path: string; size: number }[] = [];
  function walk(dir: string) {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isFile()) {
          try { files.push({ path: full, size: fs.statSync(full).size }); } catch { /* ignore */ }
        } else if (entry.isDirectory()) {
          walk(full);
        }
      }
    } catch { /* ignore */ }
  }
  walk(dirPath);
  files.sort((a, b) => b.size - a.size);
  return files.slice(0, limit);
}

export const maxDuration = 60;

/**
 * Archive old DB records to keep the database lean.
 */
async function archiveDbRecords(): Promise<{
  apiUsageLogs: number;
  notifications: number;
  webhookEvents: number;
}> {
  const now = new Date();

  // ApiUsageLog > 90 days
  const apiCutoff = new Date(now);
  apiCutoff.setDate(apiCutoff.getDate() - 90);

  // Read notifications > 30 days
  const notifCutoff = new Date(now);
  notifCutoff.setDate(notifCutoff.getDate() - 30);

  // ProcessedWebhookEvent > 7 days
  const webhookCutoff = new Date(now);
  webhookCutoff.setDate(webhookCutoff.getDate() - 7);

  const [apiResult, notifResult, webhookResult] = await Promise.allSettled([
    prisma.apiUsageLog.deleteMany({
      where: { createdAt: { lt: apiCutoff } },
    }),
    prisma.notification.deleteMany({
      where: { read: true, createdAt: { lt: notifCutoff } },
    }),
    prisma.processedWebhookEvent.deleteMany({
      where: { createdAt: { lt: webhookCutoff } },
    }),
  ]);

  return {
    apiUsageLogs: apiResult.status === 'fulfilled' ? apiResult.value.count : 0,
    notifications: notifResult.status === 'fulfilled' ? notifResult.value.count : 0,
    webhookEvents: webhookResult.status === 'fulfilled' ? webhookResult.value.count : 0,
  };
}

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
function isAuthorizedByCron(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const header = request.headers.get('x-cron-secret') || request.headers.get('authorization')?.replace('Bearer ', '');
  return header === cronSecret;
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  if ((key && key === process.env.AUTH_SECRET) || isAuthorizedByCron(request)) {
    // Authorized
  } else {
    const ctx = await getSuperAdminContext();
    if (ctx.error) return ctx.error;
  }

  let diskInfo = '';
  try {
    diskInfo = safeExec('df', ['-h', '/']);
    const dataDir = process.env.DATA_DIR;
    if (dataDir) {
      const volumeDf = safeExec('df', ['-h', dataDir]);
      if (volumeDf) diskInfo += '\n\nVolume:\n' + volumeDf;
      const breakdown = safeExec('du', ['-sh', dataDir, `${dataDir}/uploads`, `${dataDir}/outputs`, `${dataDir}/music`]);
      if (breakdown) diskInfo += '\n\nBreakdown:\n' + breakdown;
      diskInfo += `\n\nFile count:\n${countFiles(dataDir)} files`;
      const largest = findLargestFiles(dataDir, 20);
      if (largest.length > 0) {
        diskInfo += '\n\nLargest files:\n' + largest
          .map(f => `${(f.size / 1024 / 1024).toFixed(1)}M\t${f.path}`)
          .join('\n');
      }
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
  // Allow auth via query param, cron secret header, or super admin session
  const key = request.nextUrl.searchParams.get('key');
  if ((key && key === process.env.AUTH_SECRET) || isAuthorizedByCron(request)) {
    // Authorized via secret key or cron header
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

  // Get disk usage info (using safe execFileSync — no shell interpolation)
  let diskInfo = '';
  try {
    const dfOutput = safeExec('df', ['-h', '/']);
    const dfLines = dfOutput.split('\n');
    diskInfo = dfLines[dfLines.length - 1] || '';
    if (dataDir) {
      const volDf = safeExec('df', ['-h', dataDir]);
      const volLines = volDf.split('\n');
      diskInfo += '\n' + (volLines[volLines.length - 1] || '');
      diskInfo += '\n' + safeExec('du', ['-sh', dataDir, `${dataDir}/uploads`, `${dataDir}/outputs`, `${dataDir}/music`]);
    }
  } catch { /* ignore */ }

  // Archive old DB records
  let dbArchival = { apiUsageLogs: 0, notifications: 0, webhookEvents: 0 };
  try {
    dbArchival = await archiveDbRecords();
  } catch (err) {
    console.error('[Cleanup] DB archival failed:', err);
  }

  return NextResponse.json({
    message: `Cleaned up ${totalMB}MB`,
    outputs: { deleted: outputs.deleted, mb: (outputs.bytes / (1024 * 1024)).toFixed(1) },
    uploads: { deleted: uploads.deleted, mb: (uploads.bytes / (1024 * 1024)).toFixed(1) },
    music: { deleted: music.deleted, mb: (music.bytes / (1024 * 1024)).toFixed(1) },
    volumeStray: { deleted: volumeStray.deleted, mb: (volumeStray.bytes / (1024 * 1024)).toFixed(1) },
    dbArchival,
    diskInfo,
  });
}
