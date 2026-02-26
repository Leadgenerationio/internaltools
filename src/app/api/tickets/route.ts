import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { sendTicketCreatedEmail } from '@/lib/email';
import { sanitizeHtml as sanitize } from '@/lib/sanitize';

/**
 * GET /api/tickets — List tickets for the user's company.
 * Query params: status, page, pageSize
 */
export async function GET(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId } = authResult.auth;

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status');
  const page = Math.max(Number(url.searchParams.get('page')) || 1, 1);
  const pageSize = Math.min(Math.max(Number(url.searchParams.get('pageSize')) || 20, 1), 100);

  const where: any = { companyId };
  if (statusFilter && statusFilter !== 'ALL') {
    // Support comma-separated statuses for filter tabs
    const statuses = statusFilter.split(',').map((s) => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      where.status = statuses[0];
    } else if (statuses.length > 1) {
      where.status = { in: statuses };
    }
  }

  try {
    const [tickets, totalCount] = await Promise.all([
      (prisma.supportTicket as any).findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          ticketNumber: true,
          subject: true,
          category: true,
          priority: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          closedAt: true,
          user: { select: { name: true, email: true } },
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
    console.error('Tickets list error:', error);
    return NextResponse.json({ error: 'Failed to load tickets' }, { status: 500 });
  }
}

/**
 * POST /api/tickets — Create a new support ticket.
 * Body: { subject, category, priority?, body }
 */
export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { userId, companyId, email } = authResult.auth;

  try {
    const rawBody = await request.text();
    if (rawBody.length > 20_000) {
      return NextResponse.json({ error: 'Request payload too large' }, { status: 413 });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { subject, category, priority, body: messageBody } = body;

    // Validate subject
    if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
    }
    const cleanSubject = sanitize(subject);
    if (cleanSubject.length > 200) {
      return NextResponse.json({ error: 'Subject too long (max 200 characters)' }, { status: 400 });
    }

    // Validate category
    const validCategories = ['BILLING', 'TECHNICAL', 'FEATURE_REQUEST', 'ACCOUNT', 'OTHER'];
    if (!category || !validCategories.includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    // Validate priority (optional, defaults to NORMAL)
    const validPriorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
    const ticketPriority = priority && validPriorities.includes(priority) ? priority : 'NORMAL';

    // Validate message body
    if (!messageBody || typeof messageBody !== 'string' || messageBody.trim().length === 0) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }
    const cleanBody = sanitize(messageBody);
    if (cleanBody.length > 5000) {
      return NextResponse.json({ error: 'Description too long (max 5000 characters)' }, { status: 400 });
    }

    // Create ticket + first message in a transaction
    const ticket = await (prisma as any).$transaction(async (tx: any) => {
      const newTicket = await tx.supportTicket.create({
        data: {
          companyId,
          userId,
          subject: cleanSubject,
          category,
          priority: ticketPriority,
        },
      });

      await tx.ticketMessage.create({
        data: {
          ticketId: newTicket.id,
          userId,
          body: cleanBody,
          isStaff: false,
        },
      });

      return newTicket;
    });

    // Fetch user name for email
    const user = await (prisma.user as any).findUnique({
      where: { id: userId },
      select: { name: true },
    });

    // Fire-and-forget email notification
    sendTicketCreatedEmail(email, user?.name || 'there', ticket.ticketNumber, cleanSubject);

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error: any) {
    console.error('Ticket create error:', error);
    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
  }
}
