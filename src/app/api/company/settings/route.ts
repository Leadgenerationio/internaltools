import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId, role } = authResult.auth;

  if (role !== 'OWNER' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        monthlyBudgetCents: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ company });
  } catch {
    return NextResponse.json({ error: 'Failed to load company settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId, role } = authResult.auth;

  if (role !== 'OWNER') {
    return NextResponse.json({ error: 'Only owners can update company settings' }, { status: 403 });
  }

  try {
    const rawBody = await request.text();
    if (rawBody.length > 10_000) {
      return NextResponse.json({ error: 'Request too large' }, { status: 413 });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const updates: Record<string, any> = {};

    // Monthly budget (in pence, or null to remove)
    if ('monthlyBudgetCents' in body) {
      const budget = body.monthlyBudgetCents;
      if (budget === null || budget === 0) {
        updates.monthlyBudgetCents = null;
      } else if (typeof budget === 'number' && budget > 0) {
        updates.monthlyBudgetCents = Math.round(budget);
      }
    }

    // Company name
    if (body.name && typeof body.name === 'string' && body.name.trim().length > 0) {
      updates.name = body.name.trim().slice(0, 100);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid updates provided' }, { status: 400 });
    }

    const company = await prisma.company.update({
      where: { id: companyId },
      data: updates,
      select: {
        id: true,
        name: true,
        plan: true,
        monthlyBudgetCents: true,
      },
    });

    return NextResponse.json({ company });
  } catch (error: any) {
    console.error('Company settings update error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
