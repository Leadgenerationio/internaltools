import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminContext } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const adminResult = await getSuperAdminContext();
  if (adminResult.error) return adminResult.error;

  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';
  const plan = url.searchParams.get('plan') || '';
  const sortBy = url.searchParams.get('sortBy') || 'createdAt';
  const sortOrder = (url.searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const pageSize = 20;

  try {
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (plan && ['FREE', 'STARTER', 'PRO', 'ENTERPRISE'].includes(plan)) {
      where.plan = plan;
    }

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          plan: true,
          tokenBalance: true,
          suspended: true,
          suspendedAt: true,
          createdAt: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          _count: { select: { users: true, projects: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.company.count({ where }),
    ]);

    // Get monthly token usage for these companies
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const companyIds = companies.map((c: any) => c.id);

    const monthlyTokenUsage = await prisma.tokenTransaction.groupBy({
      by: ['companyId'],
      where: {
        companyId: { in: companyIds },
        type: 'DEBIT',
        createdAt: { gte: startOfMonth },
      },
      _sum: { amount: true },
    });

    const tokenUsageMap = new Map(
      monthlyTokenUsage.map((r: any) => [r.companyId, r._sum.amount || 0])
    );

    const data = companies.map((c: any) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      plan: c.plan,
      tokenBalance: c.tokenBalance,
      suspended: c.suspended,
      suspendedAt: c.suspendedAt,
      createdAt: c.createdAt,
      stripeStatus: c.stripeSubscriptionId ? 'active' : c.stripeCustomerId ? 'customer' : 'none',
      userCount: c._count.users,
      projectCount: c._count.projects,
      monthlyTokensUsed: tokenUsageMap.get(c.id) || 0,
    }));

    return NextResponse.json({
      companies: data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error: any) {
    console.error('Admin companies list error:', error);
    return NextResponse.json({ error: 'Failed to load companies' }, { status: 500 });
  }
}
