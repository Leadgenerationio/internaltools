import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminContext, logAdminAction } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { encode } from 'next-auth/jwt';

const SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;

// POST /api/admin/impersonate — Generate a short-lived impersonation token
export async function POST(request: NextRequest) {
  const adminResult = await getSuperAdminContext();
  if (adminResult.error) return adminResult.error;
  const { userId: adminUserId } = adminResult.auth;

  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    if (!SECRET) {
      return NextResponse.json(
        { error: 'Server misconfiguration: AUTH_SECRET not set' },
        { status: 500 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Generate a short-lived JWT (15 minutes) for impersonation
    // NextAuth v5 uses the cookie name as the salt for JWT encoding
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieName = isProduction
      ? '__Secure-authjs.session-token'
      : 'authjs.session-token';

    const token = await encode({
      token: {
        sub: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
        companyId: targetUser.companyId,
        companyName: targetUser.company.name,
        role: targetUser.role,
        impersonatedBy: adminUserId,
      },
      secret: SECRET,
      salt: cookieName,
      maxAge: 15 * 60, // 15 minutes
    });

    await logAdminAction({
      adminUserId,
      action: 'IMPERSONATE',
      targetCompanyId: targetUser.companyId,
      targetUserId: userId,
      details: {
        targetEmail: targetUser.email,
        targetName: targetUser.name,
        expiresInMinutes: 15,
      },
    });

    // The token can be used by setting it as the session cookie
    // For security, we return the token and let the admin open it in an incognito window
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    return NextResponse.json({
      success: true,
      token,
      expiresInMinutes: 15,
      targetUser: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        company: targetUser.company.name,
      },
      instructions:
        'Open an incognito browser window, then set the session cookie: ' +
        `document.cookie = "${cookieName}=${token}; path=/; max-age=900${isProduction ? '; secure' : ''}"` +
        ` — then navigate to ${baseUrl}`,
    });
  } catch (error: any) {
    console.error('Admin impersonate error:', error);
    return NextResponse.json({ error: 'Failed to generate impersonation session' }, { status: 500 });
  }
}
