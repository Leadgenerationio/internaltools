import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/integrations/google-drive/disconnect
 * Clears Google Drive connection for the current user.
 */
export async function POST() {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { userId } = authResult.auth;

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        googleDriveRefreshToken: null,
        googleDriveConnected: false,
        googleDriveEmail: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to disconnect Google Drive' },
      { status: 500 }
    );
  }
}
