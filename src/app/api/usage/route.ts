import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { getBalance, getMonthlyTokenUsage } from '@/lib/token-balance';
import { getPlanLimits } from '@/lib/plans';

export async function GET(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId, role } = authResult.auth;

  if (role !== 'OWNER' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const url = new URL(request.url);
  const days = Math.min(Number(url.searchParams.get('days')) || 30, 365);
  const page = Math.max(Number(url.searchParams.get('page')) || 1, 1);
  const pageSize = Math.min(Math.max(Number(url.searchParams.get('pageSize')) || 50, 10), 200);

  const since = new Date();
  since.setDate(since.getDate() - days);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  try {
    const [
      tokenBalance,
      monthlyTokensUsed,
      byReason,
      byUser,
      recentTransactions,
      company,
      totalTransactions,
    ] = await Promise.all([
      getBalance(companyId),
      getMonthlyTokenUsage(companyId),

      // Token usage breakdown by reason (this month)
      prisma.tokenTransaction.groupBy({
        by: ['reason'],
        where: { companyId, type: 'DEBIT', createdAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),

      // Token usage by user (period)
      prisma.tokenTransaction.groupBy({
        by: ['userId'],
        where: { companyId, type: 'DEBIT', createdAt: { gte: since }, userId: { not: null } },
        _sum: { amount: true },
        _count: true,
      }),

      // Recent transactions (paginated)
      prisma.tokenTransaction.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip: (page - 1) * pageSize,
        include: { user: { select: { name: true, email: true } } },
      }),

      // Company info
      prisma.company.findUnique({
        where: { id: companyId },
        select: { plan: true, monthlyTokenBudget: true },
      }),

      // Total count for pagination
      prisma.tokenTransaction.count({ where: { companyId } }),
    ]);

    // Resolve user names
    const userIds = byUser.map((u: any) => u.userId).filter(Boolean) as string[];
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u: any) => [u.id, u]));

    const plan = getPlanLimits(company?.plan || 'FREE');

    return NextResponse.json({
      tokenBalance,
      monthlyTokensUsed,
      monthlyAllocation: plan.monthlyTokens,
      monthlyTokenBudget: company?.monthlyTokenBudget || null,
      plan: company?.plan || 'FREE',
      byReason: byReason.map((r: any) => ({
        reason: r.reason,
        totalTokens: r._sum.amount || 0,
      })),
      byUser: byUser.map((u: any) => ({
        userId: u.userId,
        name: (userMap.get(u.userId) as any)?.name || (userMap.get(u.userId) as any)?.email || 'Unknown',
        totalTokens: u._sum.amount || 0,
        operationCount: u._count,
      })),
      recentTransactions: recentTransactions.map((t: any) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balanceAfter,
        reason: t.reason,
        description: t.description,
        userName: t.user?.name || t.user?.email || 'System',
        createdAt: t.createdAt,
      })),
      pagination: {
        page,
        pageSize,
        total: totalTransactions,
        totalPages: Math.ceil(totalTransactions / pageSize),
      },
    });
  } catch (error: any) {
    console.error('Usage API error:', error);
    return NextResponse.json({ error: 'Failed to load usage data' }, { status: 500 });
  }
}
