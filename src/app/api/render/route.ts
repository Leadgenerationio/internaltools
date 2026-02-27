import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { renderVideo, batchRender } from '@/lib/ffmpeg-renderer';
import { uploadFile, isCloudStorage } from '@/lib/storage';
import { getAuthContext } from '@/lib/api-auth';
import { checkTokenBalance } from '@/lib/check-limits';
import { deductTokens, refundTokens } from '@/lib/token-balance';
import { checkTokenAlerts } from '@/lib/spend-alerts';
import { calculateRenderTokens } from '@/lib/token-pricing';
import { sendRenderCompleteEmail } from '@/lib/email';
import { createNotification } from '@/lib/notifications';
import { prisma } from '@/lib/prisma';
import type { TextOverlay, MusicTrack, UploadedVideo } from '@/lib/types';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'outputs');
const PUBLIC_DIR = path.join(process.cwd(), 'public');

/** Clean output files older than maxAgeMs to prevent disk-full errors.
 *  Keeps recent files from the current render session intact. */
function cleanOldOutputs(maxAgeMs = 30 * 60 * 1000): void {
  if (!fs.existsSync(OUTPUT_DIR)) return;
  const cutoff = Date.now() - maxAgeMs;
  let deleted = 0;
  let bytes = 0;

  try {
    const entries = fs.readdirSync(OUTPUT_DIR);
    for (const entry of entries) {
      const fullPath = path.join(OUTPUT_DIR, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs < cutoff) {
          bytes += stat.isDirectory() ? 0 : stat.size;
          if (stat.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true });
          } else {
            fs.unlinkSync(fullPath);
          }
          deleted++;
        }
      } catch { /* ignore individual file errors */ }
    }
  } catch { /* ignore readdir errors */ }

  if (deleted > 0) {
    console.log(`Pre-render cleanup: deleted ${deleted} old outputs (${(bytes / 1024 / 1024).toFixed(1)}MB)`);
  }
}

function isPathSafe(resolvedPath: string, allowedDir: string): boolean {
  const normalized = path.normalize(resolvedPath);
  return normalized.startsWith(path.normalize(allowedDir));
}

/** Extract the public-relative path from a URL (handles both /api/files?path=xxx and /xxx) */
function extractPublicPath(url: string): string {
  if (url.startsWith('/api/files')) {
    const urlObj = new URL(url, 'http://localhost');
    return urlObj.searchParams.get('path') || '';
  }
  return url.startsWith('/') ? url.slice(1) : url;
}

export const maxDuration = 300; // 5 min for batch renders

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;

  try {
    // Validate payload size
    const rawBody = await request.text();
    if (rawBody.length > 500_000) {
      return NextResponse.json({ error: 'Request payload too large' }, { status: 413 });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { videos, overlays, music, quality } = body as {
      videos: UploadedVideo[];
      overlays: TextOverlay[];
      music: MusicTrack | null;
      quality?: 'draft' | 'final';
    };

    if (!videos || videos.length === 0) {
      return NextResponse.json({ error: 'No videos to render' }, { status: 400 });
    }

    if (!overlays || overlays.length === 0) {
      return NextResponse.json({ error: 'No text overlays defined' }, { status: 400 });
    }

    // Prepare music file path - validate it stays within public
    let musicConfig: MusicTrack | null = null;
    if (music && music.file) {
      const filePath = extractPublicPath(music.file);
      const resolvedMusic = path.join(process.cwd(), 'public', filePath);
      if (!isPathSafe(resolvedMusic, PUBLIC_DIR)) {
        return NextResponse.json({ error: 'Invalid music path' }, { status: 400 });
      }
      if (!fs.existsSync(resolvedMusic)) {
        return NextResponse.json({ error: 'Music file not found' }, { status: 400 });
      }
      musicConfig = { ...music, file: resolvedMusic };
    }

    // Prepare video paths - validate they stay within uploads
    const videoPaths: { inputPath: string; outputPath: string; width: number; height: number; duration: number; trimStart?: number; trimEnd?: number }[] = [];
    for (const v of videos) {
      const cleanPath = extractPublicPath(v.path);
      if (!cleanPath.startsWith('uploads/')) {
        return NextResponse.json({ error: 'Invalid video path' }, { status: 400 });
      }
      const inputPath = path.join(process.cwd(), 'public', cleanPath);
      if (!isPathSafe(inputPath, UPLOAD_DIR)) {
        return NextResponse.json({ error: 'Invalid video path' }, { status: 400 });
      }
      if (!fs.existsSync(inputPath)) {
        return NextResponse.json({ error: `Video not found: ${v.originalName}` }, { status: 400 });
      }
      videoPaths.push({
        inputPath,
        outputPath: path.join(OUTPUT_DIR, `${uuidv4()}_output.mp4`),
        width: v.width,
        height: v.height,
        duration: v.duration,
        trimStart: v.trimStart,
        trimEnd: v.trimEnd,
      });
    }

    // Calculate total output count (this is the number of finished ad videos)
    const outputCount = videoPaths.length;
    const tokenCost = calculateRenderTokens(outputCount);

    // Check token balance before rendering
    if (tokenCost > 0) {
      const limitError = await checkTokenBalance(authResult.auth.companyId, tokenCost);
      if (limitError) return limitError;

      // Deduct tokens upfront
      const deduction = await deductTokens({
        companyId: authResult.auth.companyId,
        userId: authResult.auth.userId,
        amount: tokenCost,
        reason: 'RENDER',
        description: `Render ${outputCount} video${outputCount !== 1 ? 's' : ''}`,
      });

      if (!deduction.success) {
        return NextResponse.json(
          {
            error: `You need ${tokenCost} tokens but have ${deduction.balance}. Top up or upgrade your plan.`,
            code: 'INSUFFICIENT_TOKENS',
            balance: deduction.balance,
            required: tokenCost,
          },
          { status: 402 }
        );
      }
    }

    // Clean outputs older than 30 min to free disk (preserves current session)
    cleanOldOutputs();

    let outputPaths: string[];
    try {
      outputPaths = await batchRender(videoPaths, overlays, musicConfig, undefined, quality);
    } catch (renderErr: any) {
      // Refund tokens on render failure
      if (tokenCost > 0) {
        await refundTokens({
          companyId: authResult.auth.companyId,
          userId: authResult.auth.userId,
          amount: tokenCost,
          description: `Refund: render failed — ${renderErr.message}`,
        });
      }
      throw renderErr;
    }

    // Upload to cloud storage if configured, otherwise return local paths
    const usingCloud = isCloudStorage;
    const results = [];
    for (let i = 0; i < outputPaths.length; i++) {
      const p = outputPaths[i];
      const storagePath = `outputs/${path.basename(p)}`;
      const outputUrl = await uploadFile(p, storagePath);
      results.push({
        videoId: videos[i].id,
        originalName: videos[i].originalName,
        outputUrl,
      });
      // If using cloud storage, delete local file to save disk space
      if (usingCloud) {
        try { fs.unlinkSync(p); } catch { /* ignore */ }
      }
    }

    // Check token alerts after successful render
    checkTokenAlerts(authResult.auth.companyId);

    // Send render-complete email + in-app notification (fire-and-forget)
    const videoCount = results.length;
    try {
      const user = await prisma.user.findUnique({
        where: { id: authResult.auth.userId },
        select: { name: true, email: true },
      });
      if (user) {
        sendRenderCompleteEmail(
          user.email,
          user.name || '',
          videoCount
        );
      }
    } catch {
      // Ignore — email is non-critical
    }

    createNotification(
      authResult.auth.userId,
      'RENDER_COMPLETE',
      `${videoCount} video${videoCount !== 1 ? 's' : ''} ready`,
      `Your render is complete. ${videoCount} video${videoCount !== 1 ? 's are' : ' is'} ready to download.`,
      '/'
    );

    return NextResponse.json({ results, tokensUsed: tokenCost });
  } catch (error: any) {
    console.error('Render error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
