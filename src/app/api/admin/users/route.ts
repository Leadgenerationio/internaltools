import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminContext } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const adminResult = await getSuperAdminContext();
  if (adminResult.error) return adminResult.error;

  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';
  const role = url.searchParams.get('role') || '';
  const companyId = url.searchParams.get('companyId') || '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const pageSize = 20;

  try {
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role && ['OWNER', 'ADMIN', 'MEMBER'].includes(role)) {
      where.role = role;
    }

    if (companyId) {
      where.companyId = companyId;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          lastLoginAt: true,
          companyId: true,
          company: {
            select: {
              name: true,
              plan: true,
              suspended: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json({
      users: users.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        companyId: u.companyId,
        companyName: u.company.name,
        companyPlan: u.company.plan,
        companySuspended: u.company.suspended,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error: any) {
    console.error('Admin users list error:', error);
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 });
  }
}
