import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

function isSuperAdmin(email: string): boolean {
  const allowed = (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

export async function GET() {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { email } = authResult.auth;

  if (!isSuperAdmin(email)) {
    return NextResponse.json({ error: 'Forbidden — super admin access required' }, { status: 403 });
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  try {
    const [
      totalCompanies,
      totalUsers,
      monthlySpendAgg,
      allTimeSpendAgg,
      monthlyRevenueAgg,
      allTimeRevenueAgg,
      activeSubscriptions,
      companiesRaw,
      recentCalls,
    ] = await Promise.all([
      prisma.company.count(),
      prisma.user.count(),

      // Monthly internal API cost
      prisma.apiUsageLog.aggregate({
        where: { createdAt: { gte: startOfMonth }, success: true },
        _sum: { costCents: true },
      }),

      // All-time internal API cost
      prisma.apiUsageLog.aggregate({
        where: { success: true },
        _sum: { costCents: true },
      }),

      // Monthly revenue from token top-ups
      prisma.tokenTransaction.aggregate({
        where: { createdAt: { gte: startOfMonth }, type: 'CREDIT', reason: { in: ['TOPUP_PURCHASE', 'PLAN_ALLOCATION'] } },
        _sum: { amount: true },
      }),

      // All-time revenue from token top-ups
      prisma.tokenTransaction.aggregate({
        where: { type: 'CREDIT', reason: { in: ['TOPUP_PURCHASE', 'PLAN_ALLOCATION'] } },
        _sum: { amount: true },
      }),

      // Active paid subscriptions
      prisma.company.count({
        where: { stripeSubscriptionId: { not: null } },
      }),

      // All companies with plan info
      prisma.company.findMany({
        select: {
          id: true,
          name: true,
          plan: true,
          _count: { select: { users: true } },
        },
        orderBy: { name: 'asc' },
      }),

      // Recent API calls
      prisma.apiUsageLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          user: { select: { name: true, email: true } },
          company: { select: { name: true } },
        },
      }),
    ]);

    // Plan distribution
    const planDistribution: Record<string, number> = { FREE: 0, STARTER: 0, PRO: 0, ENTERPRISE: 0 };
    companiesRaw.forEach((c: any) => {
      const plan = c.plan || 'FREE';
      planDistribution[plan] = (planDistribution[plan] || 0) + 1;
    });

    return NextResponse.json({
      totalCompanies,
      totalUsers,
      activeSubscriptions,
      monthlySpendPence: monthlySpendAgg._sum.costCents || 0,
      allTimeSpendPence: allTimeSpendAgg._sum.costCents || 0,
      monthlyRevenuePence: (monthlyRevenueAgg._sum.amount || 0) * 10, // rough estimate
      allTimeRevenuePence: (allTimeRevenueAgg._sum.amount || 0) * 10,
      planDistribution,
      recentActivity: recentCalls.map((c: any) => ({
        id: c.id,
        service: c.service,
        endpoint: c.endpoint,
        model: c.model,
        costCents: c.costCents,
        tokensCost: c.tokensCost ?? null,
        success: c.success,
        durationMs: c.durationMs,
        createdAt: c.createdAt,
        userName: c.user?.name || c.user?.email || 'Unknown',
        companyName: c.company?.name || 'Unknown',
      })),
    });
  } catch (error: any) {
    console.error('Admin API error:', error);
    return NextResponse.json({ error: 'Failed to load admin data' }, { status: 500 });
  }
}
