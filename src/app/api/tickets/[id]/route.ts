import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/tickets/[id] — Get ticket with all messages.
 * Verifies the ticket belongs to the user's company.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId } = authResult.auth;

  const { id } = await params;

  try {
    const ticket = await (prisma.supportTicket as any).findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Verify company ownership
    if (ticket.companyId !== companyId) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    return NextResponse.json({
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        closedAt: ticket.closedAt,
        user: ticket.user,
        messages: ticket.messages.map((m: any) => ({
          id: m.id,
          body: m.body,
          isStaff: m.isStaff,
          createdAt: m.createdAt,
          user: m.user
            ? { id: m.user.id, name: m.user.name, email: m.user.email }
            : null,
        })),
      },
    });
  } catch (error: any) {
    console.error('Ticket detail error:', error);
    return NextResponse.json({ error: 'Failed to load ticket' }, { status: 500 });
  }
}
