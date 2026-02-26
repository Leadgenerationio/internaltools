import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { sanitizeHtml as sanitize } from '@/lib/sanitize';

/**
 * POST /api/tickets/[id]/messages — Add a message to a ticket.
 * Verifies company ownership. Auto-reopens if status was RESOLVED.
 * Body: { body }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { userId, companyId } = authResult.auth;

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

    const { body: messageBody } = body;

    if (!messageBody || typeof messageBody !== 'string' || messageBody.trim().length === 0) {
      return NextResponse.json({ error: 'Message body is required' }, { status: 400 });
    }
    const cleanBody = sanitize(messageBody);
    if (cleanBody.length > 5000) {
      return NextResponse.json({ error: 'Message too long (max 5000 characters)' }, { status: 400 });
    }

    // Verify ticket exists and belongs to the company
    const ticket = await (prisma.supportTicket as any).findUnique({
      where: { id },
      select: { id: true, companyId: true, status: true },
    });

    if (!ticket || ticket.companyId !== companyId) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Don't allow replies to CLOSED tickets
    if (ticket.status === 'CLOSED') {
      return NextResponse.json({ error: 'Cannot reply to a closed ticket' }, { status: 400 });
    }

    // Create message and auto-reopen if RESOLVED
    const result = await (prisma as any).$transaction(async (tx: any) => {
      const message = await tx.ticketMessage.create({
        data: {
          ticketId: id,
          userId,
          body: cleanBody,
          isStaff: false,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      // Auto-reopen resolved tickets when customer replies
      if (ticket.status === 'RESOLVED') {
        await tx.supportTicket.update({
          where: { id },
          data: { status: 'OPEN', closedAt: null },
        });
      } else {
        // Just update the updatedAt timestamp
        await tx.supportTicket.update({
          where: { id },
          data: { updatedAt: new Date() },
        });
      }

      return message;
    });

    return NextResponse.json({
      message: {
        id: result.id,
        body: result.body,
        isStaff: result.isStaff,
        createdAt: result.createdAt,
        user: result.user
          ? { id: result.user.id, name: result.user.name, email: result.user.email }
          : null,
      },
      reopened: ticket.status === 'RESOLVED',
    }, { status: 201 });
  } catch (error: any) {
    console.error('Ticket message error:', error);
    return NextResponse.json({ error: 'Failed to add message' }, { status: 500 });
  }
}
