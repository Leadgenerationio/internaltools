import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import {
  refreshAccessToken,
  uploadToDrive,
  createFolder,
} from '@/lib/google-drive';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';

const PUBLIC_DIR = path.join(process.cwd(), 'public');

/** Max concurrent uploads to Google Drive to avoid rate limiting */
const MAX_CONCURRENT = 3;

function isPathSafe(resolvedPath: string, allowedDir: string): boolean {
  const normalized = path.normalize(resolvedPath);
  return normalized.startsWith(path.normalize(allowedDir));
}

/** Check if a URL is an external (absolute) URL */
function isExternalUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

/** Validate an external URL is from our configured storage origin (prevents SSRF) */
function isAllowedExternalUrl(url: string): boolean {
  const allowedOrigin = process.env.CDN_URL || process.env.S3_PUBLIC_URL;
  if (!allowedOrigin) return false;
  try {
    const allowed = new URL(allowedOrigin).origin;
    const target = new URL(url).origin;
    return target === allowed;
  } catch {
    return false;
  }
}

/** Extract the public-relative file path from a URL (handles /api/files?path=xxx and /xxx) */
function extractPublicPath(url: string): string {
  if (url.startsWith('/api/files')) {
    try {
      const urlObj = new URL(url, 'http://localhost');
      return urlObj.searchParams.get('path') || '';
    } catch {
      return '';
    }
  }
  return url.startsWith('/') ? url.slice(1) : url;
}

/** Get MIME type from file extension or URL */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().split('?')[0]; // Strip query params
  const types: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
  };
  return types[ext] || 'video/mp4';
}

/**
 * Get a readable stream for a file — handles both local paths and external URLs.
 * Returns { stream, mimeType } or throws with a descriptive error.
 */
async function getFileStream(
  fileUrl: string
): Promise<{ stream: NodeJS.ReadableStream; mimeType: string }> {
  // External URL (S3, CDN, etc.) — fetch via HTTP
  if (isExternalUrl(fileUrl)) {
    if (!isAllowedExternalUrl(fileUrl)) {
      throw new Error('File URL is not from an allowed storage origin');
    }
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch file from storage (${response.status})`);
    }
    if (!response.body) {
      throw new Error('Empty response from storage');
    }
    const mimeType = response.headers.get('content-type') || getMimeType(fileUrl);
    // Convert Web ReadableStream to Node.js Readable
    const nodeStream = Readable.fromWeb(response.body as any);
    return { stream: nodeStream, mimeType };
  }

  // Local file — resolve from /api/files?path=xxx or direct path
  const publicPath = extractPublicPath(fileUrl);
  if (!publicPath) {
    throw new Error('Invalid file URL');
  }

  const fullPath = path.join(PUBLIC_DIR, publicPath);
  if (!isPathSafe(fullPath, PUBLIC_DIR)) {
    throw new Error('Access denied');
  }

  if (!fs.existsSync(fullPath)) {
    throw new Error(
      'File not found on server — it may have been cleaned up. Please re-render and try again.'
    );
  }

  const stream = fs.createReadStream(fullPath);
  const mimeType = getMimeType(fullPath);
  return { stream, mimeType };
}

export const maxDuration = 300; // 5 minutes for batch uploads

/**
 * POST /api/integrations/google-drive/export
 * Uploads rendered videos to Google Drive.
 *
 * Body: {
 *   files: Array<{ url: string; name: string }>,
 *   folderId?: string
 * }
 *
 * Returns per-file results for partial success handling.
 */
export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { userId } = authResult.auth;

  // Parse and validate body
  let body: { files: Array<{ url: string; name: string }>; folderId?: string };
  try {
    const rawBody = await request.text();
    if (rawBody.length > 100_000) {
      return NextResponse.json({ error: 'Request payload too large' }, { status: 413 });
    }
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
    return NextResponse.json({ error: 'No files specified for export' }, { status: 400 });
  }

  if (body.files.length > 50) {
    return NextResponse.json({ error: 'Maximum 50 files per export' }, { status: 400 });
  }

  // Get user's Drive tokens
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      googleDriveConnected: true,
      googleDriveRefreshToken: true,
    },
  });

  if (!user?.googleDriveConnected || !user.googleDriveRefreshToken) {
    return NextResponse.json(
      { error: 'Google Drive not connected. Please connect first in Settings.' },
      { status: 400 }
    );
  }

  // Get fresh access token
  let accessToken: string;
  try {
    accessToken = await refreshAccessToken(user.googleDriveRefreshToken);
  } catch (err: any) {
    // Handle revoked access
    if (err.message?.includes('invalid_grant') || err.code === 401) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          googleDriveConnected: false,
          googleDriveRefreshToken: null,
          googleDriveEmail: null,
        },
      });
      return NextResponse.json(
        { error: 'Google Drive access was revoked. Please reconnect in Settings.' },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to authenticate with Google Drive' },
      { status: 500 }
    );
  }

  // Create or use destination folder
  let targetFolderId = body.folderId;
  let folderUrl = '';

  if (!targetFolderId) {
    try {
      // Create "Ad Maker Exports" parent folder (or find it if it already exists)
      const parentFolder = await createFolder(accessToken, 'Ad Maker Exports');

      // Create date-stamped subfolder
      const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const timeStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '-');
      const subfolder = await createFolder(
        accessToken,
        `${dateStr} ${timeStr}`,
        parentFolder.folderId
      );

      targetFolderId = subfolder.folderId;
      folderUrl = subfolder.webViewLink;
    } catch (err: any) {
      return NextResponse.json(
        { error: `Failed to create Drive folder: ${err.message}` },
        { status: 500 }
      );
    }
  }

  // Upload files with concurrency limit
  const results: Array<{
    name: string;
    success: boolean;
    fileId?: string;
    error?: string;
  }> = [];

  // Process in batches of MAX_CONCURRENT
  for (let i = 0; i < body.files.length; i += MAX_CONCURRENT) {
    const batch = body.files.slice(i, i + MAX_CONCURRENT);

    const batchResults = await Promise.allSettled(
      batch.map(async (file) => {
        const { stream, mimeType } = await getFileStream(file.url);

        // Clean up name for Drive (replace problem characters)
        const safeName = file.name.replace(/[<>:"/\\|?*]/g, '_');

        const result = await uploadToDrive(
          accessToken,
          safeName,
          stream,
          mimeType,
          targetFolderId
        );

        return { name: file.name, fileId: result.fileId };
      })
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      if (result.status === 'fulfilled') {
        results.push({
          name: result.value.name,
          success: true,
          fileId: result.value.fileId,
        });
      } else {
        results.push({
          name: batch[j].name,
          success: false,
          error: result.reason?.message || 'Upload failed',
        });
      }
    }
  }

  const exported = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  // If we didn't have a folderUrl yet (user provided folderId), construct one
  if (!folderUrl && targetFolderId) {
    folderUrl = `https://drive.google.com/drive/folders/${targetFolderId}`;
  }

  return NextResponse.json({
    exported,
    failed,
    total: body.files.length,
    folderId: targetFolderId,
    folderUrl,
    results,
  });
}
