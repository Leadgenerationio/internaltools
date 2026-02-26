import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { getAuthUrl } from '@/lib/google-drive';

/**
 * GET /api/integrations/google-drive/auth
 * Returns Google OAuth consent URL for the current user.
 */
export async function GET() {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { userId } = authResult.auth;

  try {
    const baseUrl = process.env.GOOGLE_REDIRECT_URI
      || `${process.env.NEXTAUTH_URL}/api/integrations/google-drive/callback`;

    const authUrl = getAuthUrl(userId, baseUrl);

    return NextResponse.json({ url: authUrl });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to generate Google auth URL' },
      { status: 500 }
    );
  }
}
