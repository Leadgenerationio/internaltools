import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { isSuperAdmin } from '@/lib/super-admin';

/**
 * GET /api/admin/tickets — All tickets across platform.
 * Filter by status, category, priority, companyId. Sort by createdAt or updatedAt. Pagination.
 * Super admin only.
 */
export async function GET(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { email } = authResult.auth;

  if (!isSuperAdmin(email)) {
    return NextResponse.json({ error: 'Forbidden — super admin access required' }, { status: 403 });
  }

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status');
  const categoryFilter = url.searchParams.get('category');
  const priorityFilter = url.searchParams.get('priority');
  const companyFilter = url.searchParams.get('companyId');
  const sortBy = url.searchParams.get('sortBy') === 'updatedAt' ? 'updatedAt' : 'createdAt';
  const sortOrder = url.searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';
  const page = Math.max(Number(url.searchParams.get('page')) || 1, 1);
  const pageSize = Math.min(Math.max(Number(url.searchParams.get('pageSize')) || 20, 1), 100);

  const where: any = {};
  if (statusFilter && statusFilter !== 'ALL') {
    where.status = statusFilter;
  }
  if (categoryFilter && categoryFilter !== 'ALL') {
    where.category = categoryFilter;
  }
  if (priorityFilter && priorityFilter !== 'ALL') {
    where.priority = priorityFilter;
  }
  if (companyFilter) {
    where.companyId = companyFilter;
  }

  try {
    const [tickets, totalCount] = await Promise.all([
      (prisma.supportTicket as any).findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { name: true, email: true } },
          company: { select: { id: true, name: true } },
          _count: { select: { messages: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { createdAt: true, isStaff: true },
          },
        },
      }),
      (prisma.supportTicket as any).count({ where }),
    ]);

    return NextResponse.json({
      tickets: tickets.map((t: any) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        subject: t.subject,
        category: t.category,
        priority: t.priority,
        status: t.status,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        closedAt: t.closedAt,
        userName: t.user.name || t.user.email,
        userEmail: t.user.email,
        companyId: t.company.id,
        companyName: t.company.name,
        messageCount: t._count.messages,
        lastMessageAt: t.messages[0]?.createdAt || t.createdAt,
        lastMessageIsStaff: t.messages[0]?.isStaff || false,
      })),
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    });
  } catch (error: any) {
    console.error('Admin tickets list error:', error);
    return NextResponse.json({ error: 'Failed to load tickets' }, { status: 500 });
  }
}
