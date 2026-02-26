import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminContext, logAdminAction } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';

// GET /api/admin/companies/[id] — Full company detail
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminResult = await getSuperAdminContext();
  if (adminResult.error) return adminResult.error;

  const { id } = await params;

  try {
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            createdAt: true,
            lastLoginAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: { projects: true, apiUsage: true, tokenTransactions: true },
        },
      },
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Get recent transactions
    const recentTransactions = await prisma.tokenTransaction.findMany({
      where: { companyId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        user: { select: { name: true, email: true } },
      },
    });

    // Get monthly token usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyUsage = await prisma.tokenTransaction.aggregate({
      where: {
        companyId: id,
        type: 'DEBIT',
        createdAt: { gte: startOfMonth },
      },
      _sum: { amount: true },
    });

    // Get total revenue from this company
    const totalRevenue = await prisma.tokenTopup.aggregate({
      where: { companyId: id, status: 'COMPLETED' },
      _sum: { pricePence: true },
    });

    return NextResponse.json({
      ...company,
      monthlyTokensUsed: monthlyUsage._sum.amount || 0,
      totalRevenuePence: totalRevenue._sum.pricePence || 0,
      recentTransactions: recentTransactions.map((t: any) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balanceAfter,
        reason: t.reason,
        description: t.description,
        createdAt: t.createdAt,
        userName: t.user?.name || t.user?.email || 'System',
      })),
    });
  } catch (error: any) {
    console.error('Admin company detail error:', error);
    return NextResponse.json({ error: 'Failed to load company details' }, { status: 500 });
  }
}

// PUT /api/admin/companies/[id] — Update company (plan, suspension, token balance)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminResult = await getSuperAdminContext();
  if (adminResult.error) return adminResult.error;
  const { userId } = adminResult.auth;

  const { id } = await params;

  try {
    const body = await request.json();
    const { plan, suspended, suspendedReason, tokenBalance } = body;

    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const updates: any = {};
    const auditActions: Array<{ action: any; details: Record<string, unknown> }> = [];

    // Plan change
    if (plan && plan !== company.plan) {
      if (!['FREE', 'STARTER', 'PRO', 'ENTERPRISE'].includes(plan)) {
        return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
      }
      updates.plan = plan;
      auditActions.push({
        action: 'CHANGE_PLAN',
        details: { previousPlan: company.plan, newPlan: plan },
      });
    }

    // Suspension toggle
    if (typeof suspended === 'boolean' && suspended !== company.suspended) {
      updates.suspended = suspended;
      if (suspended) {
        updates.suspendedAt = new Date();
        updates.suspendedReason = suspendedReason || 'Suspended by admin';
        auditActions.push({
          action: 'SUSPEND',
          details: { reason: updates.suspendedReason },
        });
      } else {
        updates.suspendedAt = null;
        updates.suspendedReason = null;
        auditActions.push({
          action: 'UNSUSPEND',
          details: { previousReason: company.suspendedReason },
        });
      }
    }

    // Direct token balance adjustment
    if (typeof tokenBalance === 'number' && tokenBalance !== company.tokenBalance) {
      updates.tokenBalance = tokenBalance;
      auditActions.push({
        action: 'ADJUST_BALANCE',
        details: {
          previousBalance: company.tokenBalance,
          newBalance: tokenBalance,
          adjustment: tokenBalance - company.tokenBalance,
        },
      });
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
    }

    const updated = await prisma.company.update({
      where: { id },
      data: updates,
    });

    // Log all admin actions
    await Promise.allSettled(
      auditActions.map(({ action, details }) =>
        logAdminAction({
          adminUserId: userId,
          action,
          targetCompanyId: id,
          details,
        })
      )
    );

    return NextResponse.json({ success: true, company: updated });
  } catch (error: any) {
    console.error('Admin company update error:', error);
    return NextResponse.json({ error: 'Failed to update company' }, { status: 500 });
  }
}
