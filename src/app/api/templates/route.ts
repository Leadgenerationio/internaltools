import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/templates — List templates visible to the user.
 * Returns system templates + user's company templates.
 * Query: ?category=xxx&search=xxx&page=1&pageSize=20
 */
export async function GET(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId } = authResult.auth;

  const url = new URL(request.url);
  const category = url.searchParams.get('category') || undefined;
  const search = url.searchParams.get('search') || undefined;
  const page = Math.max(Number(url.searchParams.get('page')) || 1, 1);
  const pageSize = Math.min(
    Math.max(Number(url.searchParams.get('pageSize')) || 20, 1),
    100
  );

  try {
    // Build the where clause: system templates OR company templates
    const where: any = {
      OR: [{ isSystem: true }, { companyId }],
    };

    if (category) {
      where.category = category;
    }

    if (search) {
      where.AND = [
        {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [templates, totalCount] = await Promise.all([
      (prisma.projectTemplate as any).findMany({
        where,
        orderBy: [{ isSystem: 'desc' }, { useCount: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          brief: true,
          overlayStyle: true,
          staggerSeconds: true,
          isSystem: true,
          useCount: true,
          companyId: true,
          createdAt: true,
        },
      }),
      (prisma.projectTemplate as any).count({ where }),
    ]);

    // Get distinct categories for filter UI
    const categories = await (prisma.projectTemplate as any).findMany({
      where: { OR: [{ isSystem: true }, { companyId }] },
      select: { category: true },
      distinct: ['category'],
    });

    const categoryList = categories
      .map((c: any) => c.category)
      .filter(Boolean)
      .sort();

    return NextResponse.json({
      templates,
      categories: categoryList,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    });
  } catch (error: any) {
    console.error('Templates list error:', error);
    return NextResponse.json(
      { error: 'Failed to load templates' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/templates — Save current project as a template.
 * Body: { name, description?, category?, brief, overlayStyle?, staggerSeconds? }
 */
export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { userId, companyId } = authResult.auth;

  try {
    const rawBody = await request.text();
    if (rawBody.length > 50_000) {
      return NextResponse.json(
        { error: 'Request payload too large' },
        { status: 413 }
      );
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { name, description, category, brief, overlayStyle, staggerSeconds } =
      body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Template name is required' },
        { status: 400 }
      );
    }

    if (name.length > 200) {
      return NextResponse.json(
        { error: 'Template name too long (max 200 chars)' },
        { status: 400 }
      );
    }

    if (!brief || typeof brief !== 'object') {
      return NextResponse.json(
        { error: 'Brief is required' },
        { status: 400 }
      );
    }

    const template = await (prisma.projectTemplate as any).create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        category: category?.trim() || null,
        companyId,
        userId,
        brief,
        overlayStyle: overlayStyle ?? null,
        staggerSeconds: staggerSeconds ?? 2,
        isSystem: false,
      },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error: any) {
    console.error('Template create error:', error);
    return NextResponse.json(
      { error: 'Failed to create template' },
      { status: 500 }
    );
  }
}
