/**
 * In-app notification helpers.
 *
 * All functions are fire-and-forget safe — they log errors but never throw,
 * so callers can safely call without awaiting or wrapping in try/catch.
 */

import { prisma } from '@/lib/prisma';
import { getCachedUnreadCount, setCachedUnreadCount, invalidateUnreadCount } from '@/lib/cache';
import { getRedis } from '@/lib/redis';

const NOTIFICATION_CHANNEL_PREFIX = 'notifications:';

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
 * Publish a notification event via Redis pub/sub for SSE clients.
 * Fire-and-forget — silently skips if Redis unavailable.
 */
async function publishToSSE(userId: string, notification: { type: string; title: string; body: string; link?: string | null }): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.publish(
      `${NOTIFICATION_CHANNEL_PREFIX}${userId}`,
      JSON.stringify(notification)
    );
  } catch {
    // Silently fail — SSE is best-effort
  }
}

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
    const notification = await prisma.notification.create({
      data: { userId, type, title, body, link: link || null },
    });
    // Invalidate cached unread count for this user
    invalidateUnreadCount(userId).catch(() => {});
    // Push to SSE clients in real-time
    publishToSSE(userId, { type, title, body, link: notification.link }).catch(() => {});
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

    // Invalidate cached unread counts + push SSE for all users in the company
    await Promise.allSettled(
      users.flatMap((u: { id: string }) => [
        invalidateUnreadCount(u.id),
        publishToSSE(u.id, { type, title, body, link }),
      ])
    );
  } catch (error) {
    console.error('[Notifications] Failed to create company notification:', error);
  }
}

/**
 * Get the count of unread notifications for a user.
 * Used for the badge on the notification bell (polled every 30s).
 * Cached in Redis (15s TTL) to reduce DB load from polling.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  try {
    // Try cache first (15s TTL)
    const cached = await getCachedUnreadCount(userId);
    if (cached !== null) return cached;

    const count = await prisma.notification.count({
      where: { userId, read: false },
    });

    // Cache for next poll
    await setCachedUnreadCount(userId, count);
    return count;
  } catch (error) {
    console.error('[Notifications] Failed to get unread count:', error);
    return 0;
  }
}
