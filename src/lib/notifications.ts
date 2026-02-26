/**
 * In-app notification helpers.
 *
 * All functions are fire-and-forget safe — they log errors but never throw,
 * so callers can safely call without awaiting or wrapping in try/catch.
 */

import { prisma } from '@/lib/prisma';

export type NotificationType =
  | 'RENDER_COMPLETE'
  | 'RENDER_FAILED'
  | 'TOKEN_LOW'
  | 'BUDGET_WARNING'
  | 'PLAN_CHANGED'
  | 'TEAM_JOINED'
  | 'TICKET_REPLY'
  | 'SYSTEM';

/**
 * Create a notification for a single user.
 */
export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  link?: string
): Promise<void> {
  try {
    await prisma.notification.create({
      data: { userId, type, title, body, link: link || null },
    });
  } catch (error) {
    console.error('[Notifications] Failed to create notification:', error);
  }
}

/**
 * Create a notification for all users in a company.
 * Useful for render-complete, budget warnings, etc.
 */
export async function createCompanyNotification(
  companyId: string,
  type: NotificationType,
  title: string,
  body: string,
  link?: string
): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: { companyId },
      select: { id: true },
    });

    if (users.length === 0) return;

    await prisma.notification.createMany({
      data: users.map((u: { id: string }) => ({
        userId: u.id,
        type,
        title,
        body,
        link: link || null,
      })),
    });
  } catch (error) {
    console.error('[Notifications] Failed to create company notification:', error);
  }
}

/**
 * Get the count of unread notifications for a user.
 * Used for the badge on the notification bell.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  try {
    return await prisma.notification.count({
      where: { userId, read: false },
    });
  } catch (error) {
    console.error('[Notifications] Failed to get unread count:', error);
    return 0;
  }
}
