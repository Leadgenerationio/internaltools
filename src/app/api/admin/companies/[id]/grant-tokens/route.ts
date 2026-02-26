import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminContext, logAdminAction } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';

// POST /api/admin/companies/[id]/grant-tokens — Grant tokens to a company
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminResult = await getSuperAdminContext();
  if (adminResult.error) return adminResult.error;
  const { userId } = adminResult.auth;

  const { id } = await params;

  try {
    const body = await request.json();
    const { amount, reason } = body;

    if (!amount || typeof amount !== 'number' || amount <= 0 || amount > 100000) {
      return NextResponse.json(
        { error: 'Amount must be a positive number (max 100,000)' },
        { status: 400 }
      );
    }

    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Atomically update balance and create transaction
    const newBalance = company.tokenBalance + amount;

    const [updatedCompany, transaction] = await prisma.$transaction([
      prisma.company.update({
        where: { id },
        data: { tokenBalance: newBalance },
      }),
      prisma.tokenTransaction.create({
        data: {
          companyId: id,
          type: 'CREDIT',
          amount,
          balanceAfter: newBalance,
          reason: 'ADMIN_GRANT',
          description: reason || `Admin granted ${amount} tokens`,
        },
      }),
    ]);

    await logAdminAction({
      adminUserId: userId,
      action: 'GRANT_TOKENS',
      targetCompanyId: id,
      details: {
        amount,
        reason: reason || 'Admin grant',
        previousBalance: company.tokenBalance,
        newBalance,
      },
    });

    return NextResponse.json({
      success: true,
      tokenBalance: updatedCompany.tokenBalance,
      transaction: {
        id: transaction.id,
        amount: transaction.amount,
        balanceAfter: transaction.balanceAfter,
      },
    });
  } catch (error: any) {
    console.error('Admin grant tokens error:', error);
    return NextResponse.json({ error: 'Failed to grant tokens' }, { status: 500 });
  }
}
