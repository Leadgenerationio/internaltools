import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { sendTicketReplyEmail } from '@/lib/email';
import { isSuperAdmin } from '@/lib/super-admin';
import { sanitizeHtml as sanitize } from '@/lib/sanitize';

/**
 * GET /api/admin/tickets/[id] — Get ticket detail with messages (admin view).
 * Super admin only.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { email } = authResult.auth;

  if (!isSuperAdmin(email)) {
    return NextResponse.json({ error: 'Forbidden — super admin access required' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const ticket = await (prisma.supportTicket as any).findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        company: { select: { id: true, name: true } },
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

    return NextResponse.json({ ticket });
  } catch (error: any) {
    console.error('Admin ticket detail error:', error);
    return NextResponse.json({ error: 'Failed to load ticket' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/tickets/[id] — Update ticket status/priority and/or add staff reply.
 * Super admin only.
 * Body: { status?, priority?, reply? }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { userId, email } = authResult.auth;

  if (!isSuperAdmin(email)) {
    return NextResponse.json({ error: 'Forbidden — super admin access required' }, { status: 403 });
  }

  const { id } = await params;

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

    const { status, priority, reply } = body;

    // Verify ticket exists
    const ticket = await (prisma.supportTicket as any).findUnique({
      where: { id },
      select: {
        id: true,
        ticketNumber: true,
        subject: true,
        status: true,
        userId: true,
        user: { select: { email: true, name: true } },
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Validate status
    const validStatuses = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Validate priority
    const validPriorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
    if (priority && !validPriorities.includes(priority)) {
      return NextResponse.json({ error: 'Invalid priority' }, { status: 400 });
    }

    // Validate reply
    let cleanReply: string | null = null;
    if (reply && typeof reply === 'string' && reply.trim().length > 0) {
      cleanReply = sanitize(reply);
      if (cleanReply.length > 5000) {
        return NextResponse.json({ error: 'Reply too long (max 5000 characters)' }, { status: 400 });
      }
    }

    // Apply updates in a transaction
    const result = await (prisma as any).$transaction(async (tx: any) => {
      const updateData: any = {};

      if (status) {
        updateData.status = status;
        if (status === 'RESOLVED' || status === 'CLOSED') {
          updateData.closedAt = new Date();
        } else if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
          // Reopening — clear closedAt
          updateData.closedAt = null;
        }
      }

      if (priority) {
        updateData.priority = priority;
      }

      // Update ticket if there are changes
      let updatedTicket = ticket;
      if (Object.keys(updateData).length > 0) {
        updatedTicket = await tx.supportTicket.update({
          where: { id },
          data: updateData,
        });
      }

      // Add staff reply if provided
      let message = null;
      if (cleanReply) {
        message = await tx.ticketMessage.create({
          data: {
            ticketId: id,
            userId,
            body: cleanReply,
            isStaff: true,
          },
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        });

        // Update the ticket's updatedAt
        await tx.supportTicket.update({
          where: { id },
          data: { updatedAt: new Date() },
        });
      }

      return { ticket: updatedTicket, message };
    });

    // Send email notification to user if staff replied
    if (cleanReply && ticket.user) {
      sendTicketReplyEmail(
        ticket.user.email,
        ticket.user.name || 'there',
        ticket.ticketNumber,
        ticket.subject
      );
    }

    return NextResponse.json({
      ticket: result.ticket,
      message: result.message
        ? {
            id: result.message.id,
            body: result.message.body,
            isStaff: result.message.isStaff,
            createdAt: result.message.createdAt,
            user: result.message.user,
          }
        : null,
    });
  } catch (error: any) {
    console.error('Admin ticket update error:', error);
    return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 });
  }
}
