import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/notifications/mark-all-read
 * Mark all of the user's notifications as read.
 */
export async function POST() {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { userId } = authResult.auth;

  try {
    const result = await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });

    return NextResponse.json({ success: true, updated: result.count });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    return NextResponse.json({ error: 'Failed to mark all as read' }, { status: 500 });
  }
}
