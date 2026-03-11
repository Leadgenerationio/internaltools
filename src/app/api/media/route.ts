import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId } = authResult.auth;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
  const skip = (page - 1) * limit;

  try {
    const [files, total] = await Promise.all([
      prisma.storageFile.findMany({
        where: {
          companyId,
          mimeType: { startsWith: 'video/' },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          publicUrl: true,
          originalName: true,
          duration: true,
          width: true,
          height: true,
          thumbnailUrl: true,
          mimeType: true,
          createdAt: true,
        },
      }),
      prisma.storageFile.count({
        where: {
          companyId,
          mimeType: { startsWith: 'video/' },
        },
      }),
    ]);

    return NextResponse.json({
      files,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to load media' }, { status: 500 });
  }
}
