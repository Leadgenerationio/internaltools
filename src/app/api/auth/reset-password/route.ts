import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendPasswordResetEmail } from '@/lib/email';

/**
 * POST /api/auth/reset-password
 * Step 1: Request a password reset (body: { email })
 *   - Generates a token, stores it in memory, sends reset email via Resend
 *   - Always returns success to prevent email enumeration
 *
 * PUT /api/auth/reset-password
 * Step 2: Reset the password (body: { token, newPassword })
 *   - Validates token, updates password, deletes token
 */

// In-memory token store (replace with DB table or Redis in production)
const resetTokens = new Map<string, { email: string; expiresAt: number }>();

// Clean expired tokens every 10 minutes
setInterval(() => {
  const now = Date.now();
  resetTokens.forEach((value, key) => {
    if (now > value.expiresAt) resetTokens.delete(key);
  });
}, 10 * 60_000);

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    if (rawBody.length > 5_000) {
      return NextResponse.json({ error: 'Request too large' }, { status: 413 });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { email } = body;
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Always return success to prevent email enumeration
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

      resetTokens.set(token, { email: email.toLowerCase(), expiresAt });

      const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;

      // Send password reset email (fire-and-forget)
      sendPasswordResetEmail(
        email.toLowerCase(),
        user.name || '',
        resetUrl
      ).catch(() => {}); // Silently swallow — sendPasswordResetEmail already logs errors

      // Also log in development for debugging
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Password Reset] Token for ${email}: ${token}`);
        console.log(`[Password Reset] Reset URL: ${resetUrl}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
    });
  } catch (error: any) {
    console.error('Password reset request error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const rawBody = await request.text();
    if (rawBody.length > 5_000) {
      return NextResponse.json({ error: 'Request too large' }, { status: 413 });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { token, newPassword } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const stored = resetTokens.get(token);
    if (!stored || Date.now() > stored.expiresAt) {
      return NextResponse.json({ error: 'Invalid or expired reset token' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { email: stored.email },
      data: { passwordHash },
    });

    resetTokens.delete(token);

    return NextResponse.json({ success: true, message: 'Password has been reset. You can now sign in.' });
  } catch (error: any) {
    console.error('Password reset error:', error);
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
  }
}
