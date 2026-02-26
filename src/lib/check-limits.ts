import { prisma } from '@/lib/prisma';
import { getPlanLimits } from '@/lib/plans';
import { NextResponse } from 'next/server';

/**
 * Check if a company can make an AI generation call.
 * Returns null if allowed, or an error response if blocked.
 */
export async function checkGenerationLimit(companyId: string): Promise<NextResponse | null> {
  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { plan: true, monthlyBudgetCents: true },
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const limits = getPlanLimits(company.plan);

    // Check generation count this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const generationCount = await prisma.apiUsageLog.count({
      where: {
        companyId,
        createdAt: { gte: startOfMonth },
        success: true,
      },
    });

    if (generationCount >= limits.maxGenerationsPerMonth) {
      return NextResponse.json(
        {
          error: `Monthly generation limit reached (${limits.maxGenerationsPerMonth} on ${limits.label} plan). Upgrade your plan for more.`,
          code: 'GENERATION_LIMIT',
        },
        { status: 402 }
      );
    }

    // Check monthly budget if set
    if (company.monthlyBudgetCents) {
      const monthlySpend = await prisma.apiUsageLog.aggregate({
        where: {
          companyId,
          createdAt: { gte: startOfMonth },
          success: true,
        },
        _sum: { costCents: true },
      });

      const spent = monthlySpend._sum.costCents || 0;
      if (spent >= company.monthlyBudgetCents) {
        return NextResponse.json(
          {
            error: `Monthly budget of £${(company.monthlyBudgetCents / 100).toFixed(2)} reached. Increase your budget in settings.`,
            code: 'BUDGET_LIMIT',
          },
          { status: 402 }
        );
      }
    }

    return null; // Allowed
  } catch (err) {
    console.error('Limit check failed:', err);
    return null; // Fail open — don't block users if the check itself fails
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
