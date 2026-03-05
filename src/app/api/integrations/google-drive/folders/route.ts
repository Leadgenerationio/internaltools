import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { refreshAccessToken, listFolders, getFolderInfo } from '@/lib/google-drive';

/**
 * GET /api/integrations/google-drive/folders
 * Lists the user's Google Drive folders for the folder picker.
 * Query params:
 *   - parentId: browse into a specific folder
 *   - search: search folders by name
 */
export async function GET(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { userId } = authResult.auth;

  const { searchParams } = new URL(request.url);
  const parentId = searchParams.get('parentId') || undefined;
  const search = searchParams.get('search') || undefined;

  try {
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

    // Get a fresh access token
    const accessToken = await refreshAccessToken(user.googleDriveRefreshToken);

    const folders = await listFolders(accessToken, { parentId, search });

    // If browsing a subfolder, also return its info for breadcrumbs
    let currentFolder = null;
    if (parentId) {
      currentFolder = await getFolderInfo(accessToken, parentId);
    }

    return NextResponse.json({ folders, currentFolder });
  } catch (err: any) {
    // Handle revoked access
    if (err.message?.includes('invalid_grant') || err.code === 401) {
      // Token was revoked — mark as disconnected
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
      { error: err.message || 'Failed to list Google Drive folders' },
      { status: 500 }
    );
  }
}
