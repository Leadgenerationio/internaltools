import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { companyName, email, password, name } = await request.json();

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

    // Create company and owner user in a transaction
    const result = await prisma.$transaction(async (tx: any) => {
      const company = await tx.company.create({
        data: {
          name: companyName,
          slug,
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

      return { company, user };
    });

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
