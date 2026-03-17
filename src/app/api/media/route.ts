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
  const aspect = searchParams.get('aspect') || null;
  const category = searchParams.get('category') || 'all'; // all, videos, images, audio
  const tag = searchParams.get('tag') || null; // b-roll, talking-head, etc.
  const search = searchParams.get('search') || null;

  const where: any = { companyId };

  // Category filter
  if (category === 'videos') {
    where.mimeType = { startsWith: 'video/' };
  } else if (category === 'images') {
    where.mimeType = { startsWith: 'image/' };
  } else if (category === 'audio') {
    where.mimeType = { startsWith: 'audio/' };
  }

  // Tag filter
  if (tag) {
    where.tag = tag;
  }

  // Search filter
  if (search) {
    where.originalName = { contains: search, mode: 'insensitive' };
  }

  try {
    let files;
    let total;

    if (aspect === '9:16') {
      // Portrait filter requires JS-side comparison
      const allFiles = await prisma.storageFile.findMany({
        where: { ...where, width: { gt: 0 }, height: { gt: 0 } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, publicUrl: true, originalName: true, duration: true,
          width: true, height: true, thumbnailUrl: true, mimeType: true, createdAt: true, sizeBytes: true,
        },
      });
      const portrait = allFiles.filter((f: any) => f.height > f.width);
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
            id: true, publicUrl: true, originalName: true, duration: true,
            width: true, height: true, thumbnailUrl: true, mimeType: true, createdAt: true, sizeBytes: true, tag: true,
          },
        }),
        prisma.storageFile.count({ where }),
      ]);
    }

    return NextResponse.json({
      files,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to load media' }, { status: 500 });
  }
}
