/**
 * GET /api/avatar/library
 *
 * List avatars for the company (paginated).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId } = authResult.auth;

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
  const skip = (page - 1) * limit;

  try {
    const [avatars, total] = await Promise.all([
      prisma.avatar.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          imageUrl: true,
          prompt: true,
          createdAt: true,
        },
      }),
      prisma.avatar.count({ where: { companyId } }),
    ]);

    return NextResponse.json({ avatars, total, page, limit });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to fetch avatars' },
      { status: 500 },
    );
  }
}
