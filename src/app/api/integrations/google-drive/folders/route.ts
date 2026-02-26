import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { refreshAccessToken, listFolders } from '@/lib/google-drive';

/**
 * GET /api/integrations/google-drive/folders
 * Lists the user's Google Drive folders for the folder picker.
 */
export async function GET() {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { userId } = authResult.auth;

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

    const folders = await listFolders(accessToken);

    return NextResponse.json({ folders });
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
