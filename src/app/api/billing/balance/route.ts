import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { getBalance, getMonthlyTokenUsage } from '@/lib/token-balance';
import { getPlanLimits } from '@/lib/plans';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId } = authResult.auth;

  try {
    const [balance, monthlyUsed, company] = await Promise.all([
      getBalance(companyId),
      getMonthlyTokenUsage(companyId),
      prisma.company.findUnique({
        where: { id: companyId },
        select: { plan: true, monthlyTokenBudget: true },
      }),
    ]);

    const plan = getPlanLimits(company?.plan || 'FREE');

    return NextResponse.json({
      tokenBalance: balance,
      monthlyTokensUsed: monthlyUsed,
      monthlyAllocation: plan.monthlyTokens,
      monthlyTokenBudget: company?.monthlyTokenBudget || null,
      plan: company?.plan || 'FREE',
      topupEnabled: plan.topupEnabled,
    });
  } catch (error: any) {
    console.error('Balance API error:', error);
    return NextResponse.json({ error: 'Failed to load balance' }, { status: 500 });
  }
}
