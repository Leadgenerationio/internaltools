/**
 * POST /api/avatar/save
 *
 * Save an avatar to the company's avatar library.
 * FREE — no tokens deducted.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

interface RequestBody {
  name: string;
  imageUrl: string;
  prompt?: string;
}

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId, userId } = authResult.auth;

  const body: RequestBody = await request.json();
  const { name, imageUrl, prompt } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }
  if (!imageUrl?.trim()) {
    return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
  }

  try {
    const avatar = await prisma.avatar.create({
      data: {
        companyId,
        userId,
        name: name.trim(),
        imageUrl: imageUrl.trim(),
        prompt: prompt?.trim() || null,
      },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        prompt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ avatar });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to save avatar' },
      { status: 500 },
    );
  }
}
