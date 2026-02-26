import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/projects — List projects for the user's company.
 * Supports ?page=1&pageSize=20 pagination.
 */
export async function GET(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId } = authResult.auth;

  const url = new URL(request.url);
  const page = Math.max(Number(url.searchParams.get('page')) || 1, 1);
  const pageSize = Math.min(Math.max(Number(url.searchParams.get('pageSize')) || 20, 1), 100);

  try {
    const [projects, totalCount] = await Promise.all([
      (prisma.project as any).findMany({
        where: { companyId },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          brief: true,
          updatedAt: true,
          createdAt: true,
          _count: {
            select: {
              ads: true,
              videos: true,
              renders: true,
            },
          },
        },
      }),
      (prisma.project as any).count({ where: { companyId } }),
    ]);

    return NextResponse.json({
      projects: projects.map((p: any) => ({
        id: p.id,
        name: p.name,
        brief: p.brief,
        updatedAt: p.updatedAt,
        createdAt: p.createdAt,
        adCount: p._count.ads,
        videoCount: p._count.videos,
        renderCount: p._count.renders,
      })),
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    });
  } catch (error: any) {
    console.error('Projects list error:', error);
    return NextResponse.json({ error: 'Failed to load projects' }, { status: 500 });
  }
}

/**
 * POST /api/projects — Create a new project.
 * Body: { name, brief?, overlayStyle?, staggerSeconds?, renderQuality? }
 */
export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { userId, companyId } = authResult.auth;

  try {
    const rawBody = await request.text();
    if (rawBody.length > 50_000) {
      return NextResponse.json({ error: 'Request payload too large' }, { status: 413 });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { name, brief, overlayStyle, staggerSeconds, renderQuality } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    if (name.length > 200) {
      return NextResponse.json({ error: 'Project name too long (max 200 chars)' }, { status: 400 });
    }

    const project = await (prisma.project as any).create({
      data: {
        name: name.trim(),
        companyId,
        userId,
        brief: brief ?? null,
        overlayStyle: overlayStyle ?? null,
        staggerSeconds: staggerSeconds ?? 2,
        renderQuality: renderQuality ?? 'final',
      },
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error: any) {
    console.error('Project create error:', error);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
