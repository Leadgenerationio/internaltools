/**
 * Core token balance operations.
 * All mutations use Prisma interactive transactions for atomicity.
 */

import { prisma } from '@/lib/prisma';
import { invalidateCompanyCache } from '@/lib/cache';

type DebitResult =
  | { success: true; newBalance: number; transactionId: string }
  | { success: false; error: 'INSUFFICIENT_TOKENS'; balance: number; required: number };

/**
 * Deduct tokens from a company's balance. Atomic — uses row-level locking.
 * Returns the new balance on success, or an error if insufficient.
 */
export async function deductTokens(params: {
  companyId: string;
  userId: string;
  amount: number;
  reason: 'GENERATE_ADS' | 'GENERATE_VIDEO' | 'RENDER';
  description?: string;
  apiUsageLogId?: string;
}): Promise<DebitResult> {
  return prisma.$transaction(async (tx: any) => {
    // Check monthly token budget if set (soft limit — read before deduction)
    const company = await tx.company.findUniqueOrThrow({
      where: { id: params.companyId },
      select: { monthlyTokenBudget: true, tokenBalance: true },
    });

    if (company.monthlyTokenBudget) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const monthlyUsage = await tx.tokenTransaction.aggregate({
        where: {
          companyId: params.companyId,
          type: 'DEBIT',
          createdAt: { gte: startOfMonth },
        },
        _sum: { amount: true },
      });

      const used = monthlyUsage._sum.amount || 0;
      if (used + params.amount > company.monthlyTokenBudget) {
        return {
          success: false as const,
          error: 'INSUFFICIENT_TOKENS' as const,
          balance: company.tokenBalance,
          required: params.amount,
        };
      }
    }

    // Atomic balance deduction — single SQL statement prevents TOCTOU race condition.
    // If balance < amount, UPDATE matches 0 rows and returns nothing.
    const result: any[] = await tx.$queryRawUnsafe(
      `UPDATE "Company" SET "tokenBalance" = "tokenBalance" - $1 WHERE id = $2 AND "tokenBalance" >= $1 RETURNING "tokenBalance"`,
      params.amount,
      params.companyId
    );

    if (result.length === 0) {
      // Insufficient balance
      const current = await tx.company.findUnique({
        where: { id: params.companyId },
        select: { tokenBalance: true },
      });
      return {
        success: false as const,
        error: 'INSUFFICIENT_TOKENS' as const,
        balance: current?.tokenBalance ?? 0,
        required: params.amount,
      };
    }

    const newBalance = Number(result[0].tokenBalance);

    const transaction = await tx.tokenTransaction.create({
      data: {
        companyId: params.companyId,
        userId: params.userId,
        type: 'DEBIT',
        amount: params.amount,
        balanceAfter: newBalance,
        reason: params.reason,
        description: params.description,
        apiUsageLogId: params.apiUsageLogId,
      },
    });

    // Invalidate cached balance so next check-limits read sees the new balance
    invalidateCompanyCache(params.companyId).catch(() => {});

    return {
      success: true as const,
      newBalance,
      transactionId: transaction.id,
    };
  });
}

/**
 * Credit tokens to a company's balance (plan allocation, top-up, refund, admin grant).
 */
export async function creditTokens(params: {
  companyId: string;
  amount: number;
  reason: 'PLAN_ALLOCATION' | 'TOPUP_PURCHASE' | 'ADMIN_GRANT' | 'REFUND' | 'ADJUSTMENT';
  description?: string;
  userId?: string;
  stripePaymentId?: string;
  expiresAt?: Date;
}): Promise<{ newBalance: number; transactionId: string }> {
  return prisma.$transaction(async (tx: any) => {
    const company = await tx.company.findUniqueOrThrow({
      where: { id: params.companyId },
      select: { tokenBalance: true },
    });

    const newBalance = company.tokenBalance + params.amount;

    await tx.company.update({
      where: { id: params.companyId },
      data: { tokenBalance: newBalance },
    });

    const transaction = await tx.tokenTransaction.create({
      data: {
        companyId: params.companyId,
        userId: params.userId,
        type: 'CREDIT',
        amount: params.amount,
        balanceAfter: newBalance,
        reason: params.reason,
        description: params.description,
        stripePaymentId: params.stripePaymentId,
        expiresAt: params.expiresAt,
      },
    });

    // Invalidate cached balance
    invalidateCompanyCache(params.companyId).catch(() => {});

    return { newBalance, transactionId: transaction.id };
  });
}

/**
 * Refund tokens for a failed operation.
 */
export async function refundTokens(params: {
  companyId: string;
  userId: string;
  amount: number;
  description: string;
}): Promise<{ newBalance: number }> {
  const result = await creditTokens({
    companyId: params.companyId,
    amount: params.amount,
    reason: 'REFUND',
    description: params.description,
    userId: params.userId,
  });
  return { newBalance: result.newBalance };
}

/**
 * Get a company's current token balance.
 */
export async function getBalance(companyId: string): Promise<number> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { tokenBalance: true },
  });
  return company?.tokenBalance ?? 0;
}

/**
 * Get tokens used this month (sum of DEBIT transactions).
 */
export async function getMonthlyTokenUsage(companyId: string): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const result = await prisma.tokenTransaction.aggregate({
    where: {
      companyId,
      type: 'DEBIT',
      createdAt: { gte: startOfMonth },
    },
    _sum: { amount: true },
  });

  return result._sum.amount || 0;
}

/**
 * Get paginated transaction history.
 */
export async function getTransactionHistory(
  companyId: string,
  options: { page?: number; pageSize?: number } = {}
) {
  const page = options.page || 1;
  const pageSize = options.pageSize || 20;

  const [transactions, total] = await Promise.all([
    prisma.tokenTransaction.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: pageSize,
      skip: (page - 1) * pageSize,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.tokenTransaction.count({ where: { companyId } }),
  ]);

  return {
    transactions: transactions.map((t: any) => ({
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
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}
