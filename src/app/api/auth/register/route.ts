import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { sendWelcomeEmail } from '@/lib/email';
import { getPlanLimits } from '@/lib/plans';

export async function POST(request: NextRequest) {
  try {
    // Validate payload size
    const rawBody = await request.text();
    if (rawBody.length > 10_000) {
      return NextResponse.json({ error: 'Request payload too large' }, { status: 413 });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { companyName, email, password, name } = body;

    // Input validation
    if (typeof companyName !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'Invalid input types' }, { status: 400 });
    }

    if (companyName.length > 200 || email.length > 254 || password.length > 128) {
      return NextResponse.json({ error: 'Input exceeds maximum length' }, { status: 400 });
    }

    if (!companyName || !email || !password) {
      return NextResponse.json(
        { error: 'Company name, email, and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    // Create slug from company name
    const baseSlug = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    let slug = baseSlug;
    let suffix = 1;
    while (await prisma.company.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${suffix}`;
      suffix++;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const plan = getPlanLimits('FREE');

    // Create company and owner user in a transaction, crediting initial tokens
    const result = await prisma.$transaction(async (tx: any) => {
      const company = await tx.company.create({
        data: {
          name: companyName,
          slug,
          tokenBalance: plan.monthlyTokens,
        },
      });

      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          name: name || null,
          passwordHash,
          role: 'OWNER',
          companyId: company.id,
        },
      });

      // Record the initial token grant
      await tx.tokenTransaction.create({
        data: {
          companyId: company.id,
          userId: user.id,
          type: 'CREDIT',
          amount: plan.monthlyTokens,
          balanceAfter: plan.monthlyTokens,
          reason: 'PLAN_ALLOCATION',
          description: `Welcome! ${plan.monthlyTokens} free tokens for your Free plan.`,
        },
      });

      return { company, user };
    });

    // Fire-and-forget: send welcome email (don't block the response)
    sendWelcomeEmail(
      result.user.email,
      name || '',
      plan.monthlyTokens
    ).catch(() => {}); // Silently swallow — sendWelcomeEmail already logs errors

    return NextResponse.json({
      success: true,
      companyId: result.company.id,
      userId: result.user.id,
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Registration failed. Please try again.' },
      { status: 500 }
    );
  }
}
