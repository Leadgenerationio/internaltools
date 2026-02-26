import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId, role } = authResult.auth;

  if (role !== 'OWNER' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const url = new URL(request.url);
  const days = Math.min(Number(url.searchParams.get('days')) || 30, 365);

  const since = new Date();
  since.setDate(since.getDate() - days);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  try {
    // Run all queries in parallel
    const [
      monthlyTotal,
      byService,
      byUser,
      dailyRaw,
      recentCalls,
      company,
    ] = await Promise.all([
      // Monthly total spend
      prisma.apiUsageLog.aggregate({
        where: { companyId, createdAt: { gte: startOfMonth }, success: true },
        _sum: { costCents: true },
      }),

      // Breakdown by service
      prisma.apiUsageLog.groupBy({
        by: ['service'],
        where: { companyId, createdAt: { gte: startOfMonth }, success: true },
        _sum: { costCents: true },
      }),

      // Breakdown by user
      prisma.apiUsageLog.groupBy({
        by: ['userId'],
        where: { companyId, createdAt: { gte: since }, success: true },
        _sum: { costCents: true },
        _count: true,
      }),

      // Daily breakdown for chart
      prisma.$queryRawUnsafe(
        `SELECT DATE("createdAt") as date, service, SUM("costCents") as total
         FROM "ApiUsageLog"
         WHERE "companyId" = $1
           AND "createdAt" >= $2
           AND success = true
         GROUP BY DATE("createdAt"), service
         ORDER BY date`,
        companyId,
        since
      ),

      // Recent API calls
      prisma.apiUsageLog.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { user: { select: { name: true, email: true } } },
      }),

      // Company info for budget
      prisma.company.findUnique({
        where: { id: companyId },
        select: { monthlyBudgetCents: true, plan: true },
      }),
    ]);

    // Resolve user names for the byUser breakdown
    const userIds = byUser.map((u: any) => u.userId);
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];

    const userMap = new Map(users.map((u: any) => [u.id, u]));

    // Format daily data
    const daily = dailyRaw.map((row: any) => ({
      date: String(row.date).split('T')[0],
      service: row.service,
      totalCents: Number(row.total),
    }));

    return NextResponse.json({
      monthlyTotalCents: monthlyTotal._sum.costCents || 0,
      monthlyBudgetCents: company?.monthlyBudgetCents || null,
      plan: company?.plan || 'FREE',
      byService: byService.map((s: any) => ({
        service: s.service,
        totalCents: s._sum.costCents || 0,
      })),
      byUser: byUser.map((u: any) => ({
        userId: u.userId,
        name: (userMap.get(u.userId) as any)?.name || (userMap.get(u.userId) as any)?.email || 'Unknown',
        totalCents: u._sum.costCents || 0,
        callCount: u._count,
      })),
      daily,
      recentCalls: recentCalls.map((c: any) => ({
        id: c.id,
        service: c.service,
        endpoint: c.endpoint,
        model: c.model,
        costCents: c.costCents,
        inputTokens: c.inputTokens,
        outputTokens: c.outputTokens,
        videoCount: c.videoCount,
        success: c.success,
        durationMs: c.durationMs,
        createdAt: c.createdAt,
        userName: c.user.name || c.user.email,
      })),
    });
  } catch (error: any) {
    console.error('Usage API error:', error);
    return NextResponse.json({ error: 'Failed to load usage data' }, { status: 500 });
  }
}
