import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { isSuperAdmin } from '@/lib/super-admin';

/**
 * GET /api/admin/tickets/stats — Ticket statistics.
 * Returns: open count, avg response time, category breakdown, status breakdown.
 * Super admin only.
 */
export async function GET() {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { email } = authResult.auth;

  if (!isSuperAdmin(email)) {
    return NextResponse.json({ error: 'Forbidden — super admin access required' }, { status: 403 });
  }

  try {
    const [
      totalTickets,
      openCount,
      inProgressCount,
      waitingCount,
      resolvedCount,
      closedCount,
      byCategory,
      byPriority,
      recentTickets,
    ] = await Promise.all([
      (prisma.supportTicket as any).count(),
      (prisma.supportTicket as any).count({ where: { status: 'OPEN' } }),
      (prisma.supportTicket as any).count({ where: { status: 'IN_PROGRESS' } }),
      (prisma.supportTicket as any).count({ where: { status: 'WAITING_ON_CUSTOMER' } }),
      (prisma.supportTicket as any).count({ where: { status: 'RESOLVED' } }),
      (prisma.supportTicket as any).count({ where: { status: 'CLOSED' } }),
      (prisma.supportTicket as any).groupBy({
        by: ['category'],
        _count: { id: true },
      }),
      (prisma.supportTicket as any).groupBy({
        by: ['priority'],
        _count: { id: true },
      }),
      // Recent tickets for avg response time calculation
      (prisma.supportTicket as any).findMany({
        where: {
          messages: { some: { isStaff: true } },
        },
        select: {
          createdAt: true,
          messages: {
            where: { isStaff: true },
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: { createdAt: true },
          },
        },
        take: 100,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Calculate average first response time (in hours)
    let avgResponseTimeHours: number | null = null;
    if (recentTickets.length > 0) {
      const responseTimes = recentTickets
        .filter((t: any) => t.messages.length > 0)
        .map((t: any) => {
          const ticketCreated = new Date(t.createdAt).getTime();
          const firstStaffReply = new Date(t.messages[0].createdAt).getTime();
          return (firstStaffReply - ticketCreated) / (1000 * 60 * 60); // hours
        });

      if (responseTimes.length > 0) {
        avgResponseTimeHours =
          Math.round(
            (responseTimes.reduce((sum: number, t: number) => sum + t, 0) /
              responseTimes.length) *
              10
          ) / 10;
      }
    }

    // Convert groupBy results to objects
    const categoryBreakdown: Record<string, number> = {};
    for (const item of byCategory) {
      categoryBreakdown[item.category] = item._count.id;
    }

    const priorityBreakdown: Record<string, number> = {};
    for (const item of byPriority) {
      priorityBreakdown[item.priority] = item._count.id;
    }

    return NextResponse.json({
      totalTickets,
      statusBreakdown: {
        OPEN: openCount,
        IN_PROGRESS: inProgressCount,
        WAITING_ON_CUSTOMER: waitingCount,
        RESOLVED: resolvedCount,
        CLOSED: closedCount,
      },
      categoryBreakdown,
      priorityBreakdown,
      avgResponseTimeHours,
      activeCount: openCount + inProgressCount + waitingCount,
    });
  } catch (error: any) {
    console.error('Admin tickets stats error:', error);
    return NextResponse.json({ error: 'Failed to load ticket stats' }, { status: 500 });
  }
}
