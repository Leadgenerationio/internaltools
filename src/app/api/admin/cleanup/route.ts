import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminContext } from '@/lib/admin-auth';
import fs from 'fs';
import path from 'path';

export const maxDuration = 60;

/**
 * POST /api/admin/cleanup — Delete old output files to free disk space.
 * Auth: super admin session OR ?key=AUTH_SECRET query param.
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

  const outputsDir = path.join(process.cwd(), 'public', 'outputs');
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');

  let outputsDeleted = 0;
  let outputsBytes = 0;
  let uploadsDeleted = 0;
  let uploadsBytes = 0;

  // Delete all output files (rendered videos — can be re-rendered)
  if (fs.existsSync(outputsDir)) {
    const entries = fs.readdirSync(outputsDir);
    for (const entry of entries) {
      const fullPath = path.join(outputsDir, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          // Overlay temp dirs (should already be cleaned but might remain after crashes)
          fs.rmSync(fullPath, { recursive: true });
          outputsDeleted++;
        } else {
          outputsBytes += stat.size;
          fs.unlinkSync(fullPath);
          outputsDeleted++;
        }
      } catch (e) {
        console.warn('Failed to delete output:', fullPath, e);
      }
    }
  }

  // Check if force=true (delete ALL uploads, not just old ones)
  const force = request.nextUrl.searchParams.get('force') === 'true';
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

  if (fs.existsSync(uploadsDir)) {
    const entries = fs.readdirSync(uploadsDir);
    for (const entry of entries) {
      const fullPath = path.join(uploadsDir, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (force || stat.mtimeMs < oneDayAgo) {
          uploadsBytes += stat.size;
          if (stat.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true });
          } else {
            fs.unlinkSync(fullPath);
          }
          uploadsDeleted++;
        }
      } catch (e) {
        console.warn('Failed to delete upload:', fullPath, e);
      }
    }
  }

  const totalMB = ((outputsBytes + uploadsBytes) / (1024 * 1024)).toFixed(1);

  return NextResponse.json({
    message: `Cleaned up ${totalMB}MB`,
    outputs: { deleted: outputsDeleted, mb: (outputsBytes / (1024 * 1024)).toFixed(1) },
    uploads: { deleted: uploadsDeleted, mb: (uploadsBytes / (1024 * 1024)).toFixed(1) },
  });
}
