import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/integrations/google-drive/status
 * Returns Google Drive connection status for the current user.
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
        googleDriveEmail: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      connected: user.googleDriveConnected,
      email: user.googleDriveEmail || undefined,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to check Google Drive status' },
      { status: 500 }
    );
  }
}
