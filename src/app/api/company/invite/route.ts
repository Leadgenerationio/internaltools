import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { checkUserLimit } from '@/lib/check-limits';
import { sendTeamInviteEmail } from '@/lib/email';
import { createNotification } from '@/lib/notifications';

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId, role } = authResult.auth;

  if (role !== 'OWNER' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  // Plan user limit check
  const limitError = await checkUserLimit(companyId);
  if (limitError) return limitError;

  try {
    // Validate payload size
    const rawBody = await request.text();
    if (rawBody.length > 10_000) {
      return NextResponse.json({ error: 'Request payload too large' }, { status: 413 });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { email, name, password, userRole } = body;

    // Input validation
    if (typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'Invalid input types' }, { status: 400 });
    }

    if (email.length > 254 || password.length > 128) {
      return NextResponse.json({ error: 'Input exceeds maximum length' }, { status: 400 });
    }

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Can't create someone with higher role than yourself
    const validRoles = role === 'OWNER' ? ['OWNER', 'ADMIN', 'MEMBER'] : ['MEMBER'];
    const targetRole = validRoles.includes(userRole) ? userRole : 'MEMBER';

    // Check if email already exists
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name: name || null,
        passwordHash,
        role: targetRole,
        companyId,
      },
    });

    // Fetch company name for email + notification
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });
    const companyName = company?.name || 'your team';

    // Send invite email (fire-and-forget — never block the response)
    const loginUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/login`;
    sendTeamInviteEmail(email.toLowerCase(), name || '', companyName, password, loginUrl);

    // Create welcome notification for the new user (fire-and-forget)
    createNotification(
      user.id,
      'TEAM_JOINED',
      `Welcome to ${companyName}!`,
      `You've been added to ${companyName}. Change your temporary password in Settings.`,
      '/settings'
    );

    return NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (error: any) {
    console.error('Invite error:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}
