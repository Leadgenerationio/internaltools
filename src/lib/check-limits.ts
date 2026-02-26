import { prisma } from '@/lib/prisma';
import { getPlanLimits } from '@/lib/plans';
import { formatTokens } from '@/lib/token-pricing';
import { NextResponse } from 'next/server';

/**
 * Check if a company has enough tokens for an operation.
 * Returns null if allowed, or an error response if blocked.
 */
export async function checkTokenBalance(
  companyId: string,
  requiredTokens: number
): Promise<NextResponse | null> {
  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { tokenBalance: true, plan: true, monthlyTokenBudget: true },
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Check token balance
    if (company.tokenBalance < requiredTokens) {
      const plan = getPlanLimits(company.plan);
      return NextResponse.json(
        {
          error: `You need ${formatTokens(requiredTokens)} but have ${formatTokens(company.tokenBalance)}. ${
            plan.topupEnabled
              ? 'Top up your tokens or upgrade your plan.'
              : 'Upgrade your plan for more tokens.'
          }`,
          code: 'INSUFFICIENT_TOKENS',
          balance: company.tokenBalance,
          required: requiredTokens,
        },
        { status: 402 }
      );
    }

    // Check monthly token budget if set
    if (company.monthlyTokenBudget) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const monthlyUsage = await prisma.tokenTransaction.aggregate({
        where: {
          companyId,
          type: 'DEBIT',
          createdAt: { gte: startOfMonth },
        },
        _sum: { amount: true },
      });

      const used = monthlyUsage._sum.amount || 0;
      if (used + requiredTokens > company.monthlyTokenBudget) {
        return NextResponse.json(
          {
            error: `Monthly token budget of ${formatTokens(company.monthlyTokenBudget)} reached. Increase your budget in settings.`,
            code: 'TOKEN_BUDGET_LIMIT',
          },
          { status: 402 }
        );
      }
    }

    return null; // Allowed
  } catch (err) {
    console.error('Token balance check failed:', err);
    return null; // Fail open
  }
}

/**
 * Check if a company can add more users.
 */
export async function checkUserLimit(companyId: string): Promise<NextResponse | null> {
  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { plan: true },
    });

    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    const limits = getPlanLimits(company.plan);
    const userCount = await prisma.user.count({ where: { companyId } });

    if (userCount >= limits.maxUsers) {
      return NextResponse.json(
        {
          error: `User limit reached (${limits.maxUsers} on ${limits.label} plan). Upgrade to add more team members.`,
          code: 'USER_LIMIT',
        },
        { status: 402 }
      );
    }

    return null;
  } catch {
    return null;
  }
}
