import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminContext } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const adminResult = await getSuperAdminContext();
  if (adminResult.error) return adminResult.error;

  const url = new URL(request.url);
  const type = url.searchParams.get('type') || '';
  const reason = url.searchParams.get('reason') || '';
  const companyId = url.searchParams.get('companyId') || '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const pageSize = 20;

  try {
    const where: any = {};

    if (type && ['CREDIT', 'DEBIT'].includes(type)) {
      where.type = type;
    }

    const validReasons = [
      'PLAN_ALLOCATION', 'TOPUP_PURCHASE', 'ADMIN_GRANT', 'GENERATE_ADS',
      'GENERATE_VIDEO', 'RENDER', 'REFUND', 'EXPIRY', 'ADJUSTMENT',
    ];
    if (reason && validReasons.includes(reason)) {
      where.reason = reason;
    }

    if (companyId) {
      where.companyId = companyId;
    }

    const [transactions, total] = await Promise.all([
      prisma.tokenTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          company: { select: { name: true } },
          user: { select: { name: true, email: true } },
        },
      }),
      prisma.tokenTransaction.count({ where }),
    ]);

    return NextResponse.json({
      transactions: transactions.map((t: any) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balanceAfter,
        reason: t.reason,
        description: t.description,
        createdAt: t.createdAt,
        companyId: t.companyId,
        companyName: t.company?.name || 'Unknown',
        userName: t.user?.name || t.user?.email || 'System',
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error: any) {
    console.error('Admin transactions error:', error);
    return NextResponse.json({ error: 'Failed to load transactions' }, { status: 500 });
  }
}
