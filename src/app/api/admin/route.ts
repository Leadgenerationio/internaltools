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
      companiesRaw,
      recentCalls,
    ] = await Promise.all([
      // Total companies
      prisma.company.count(),

      // Total users
      prisma.user.count(),

      // Monthly spend (all companies)
      prisma.apiUsageLog.aggregate({
        where: { createdAt: { gte: startOfMonth }, success: true },
        _sum: { costCents: true },
      }),

      // All-time spend
      prisma.apiUsageLog.aggregate({
        where: { success: true },
        _sum: { costCents: true },
      }),

      // All companies with user counts and spend
      prisma.company.findMany({
        select: {
          id: true,
          name: true,
          plan: true,
          _count: { select: { users: true } },
        },
        orderBy: { name: 'asc' },
      }),

      // Recent API calls (last 100 across all companies)
      prisma.apiUsageLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          user: { select: { name: true, email: true } },
          company: { select: { name: true } },
        },
      }),
    ]);

    // Per-company spend calculations (monthly and all-time)
    const companyIds = companiesRaw.map((c: any) => c.id);

    const [perCompanyMonthly, perCompanyAllTime] = await Promise.all([
      prisma.apiUsageLog.groupBy({
        by: ['companyId'],
        where: { companyId: { in: companyIds }, createdAt: { gte: startOfMonth }, success: true },
        _sum: { costCents: true },
      }),
      prisma.apiUsageLog.groupBy({
        by: ['companyId'],
        where: { companyId: { in: companyIds }, success: true },
        _sum: { costCents: true },
      }),
    ]);

    const monthlyMap = new Map(
      perCompanyMonthly.map((r: any) => [r.companyId, r._sum.costCents || 0])
    );
    const allTimeMap = new Map(
      perCompanyAllTime.map((r: any) => [r.companyId, r._sum.costCents || 0])
    );

    const companies = companiesRaw.map((c: any) => ({
      id: c.id,
      name: c.name,
      plan: c.plan,
      userCount: c._count.users,
      monthlySpendPence: monthlyMap.get(c.id) || 0,
      totalSpendPence: allTimeMap.get(c.id) || 0,
    }));

    // Sort by total spend descending
    companies.sort((a: any, b: any) => b.totalSpendPence - a.totalSpendPence);

    return NextResponse.json({
      totalCompanies,
      totalUsers,
      monthlySpendPence: monthlySpendAgg._sum.costCents || 0,
      allTimeSpendPence: allTimeSpendAgg._sum.costCents || 0,
      companies,
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
        companyName: c.company.name,
      })),
    });
  } catch (error: any) {
    console.error('Admin API error:', error);
    return NextResponse.json({ error: 'Failed to load admin data' }, { status: 500 });
  }
}
