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
  const aspectRatio = searchParams.get('aspect') || null; // e.g. '9:16'

  // Build where clause
  const where: any = {
    companyId,
    mimeType: { startsWith: 'video/' },
  };

  // Filter by aspect ratio if requested
  if (aspectRatio === '9:16') {
    // Portrait: height > width
    where.width = { gt: 0 };
    where.height = { gt: 0 };
    // Prisma doesn't support column comparison, so we filter in JS below
  }

  try {
    let files;
    let total;

    if (aspectRatio === '9:16') {
      // Fetch all matching videos, then filter for portrait aspect ratio
      const allFiles = await prisma.storageFile.findMany({
        where: {
          companyId,
          mimeType: { startsWith: 'video/' },
          width: { gt: 0 },
          height: { gt: 0 },
        },
        orderBy: { createdAt: 'desc' },
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
      });

      // Portrait = height > width (covers 9:16, 4:5, etc.)
      const portrait = allFiles.filter((f: { height: number | null; width: number | null }) => f.height! > f.width!);
      total = portrait.length;
      files = portrait.slice(skip, skip + limit);
    } else {
      [files, total] = await Promise.all([
        prisma.storageFile.findMany({
          where,
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
        prisma.storageFile.count({ where }),
      ]);
    }

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
