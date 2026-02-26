import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/projects/[id] — Get a project with all related data.
 * Verifies companyId matches the session.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId } = authResult.auth;

  const { id } = await params;

  try {
    const project = await (prisma.project as any).findUnique({
      where: { id },
      include: {
        ads: {
          orderBy: { createdAt: 'asc' },
        },
        videos: {
          include: { file: { select: { publicUrl: true } } },
          orderBy: { createdAt: 'asc' },
        },
        music: {
          include: { file: { select: { publicUrl: true } } },
        },
        renders: {
          include: { file: { select: { publicUrl: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.companyId !== companyId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ project });
  } catch (error: any) {
    console.error('Project get error:', error);
    return NextResponse.json({ error: 'Failed to load project' }, { status: 500 });
  }
}

/**
 * PUT /api/projects/[id] — Update project fields.
 * Body: { name?, brief?, overlayStyle?, staggerSeconds?, renderQuality? }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId } = authResult.auth;

  const { id } = await params;

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

    // Verify ownership
    const existing = await (prisma.project as any).findUnique({
      where: { id },
      select: { companyId: true },
    });

    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Build update data from allowed fields
    const updateData: Record<string, any> = {};
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        return NextResponse.json({ error: 'Project name cannot be empty' }, { status: 400 });
      }
      if (body.name.length > 200) {
        return NextResponse.json({ error: 'Project name too long (max 200 chars)' }, { status: 400 });
      }
      updateData.name = body.name.trim();
    }
    if (body.brief !== undefined) updateData.brief = body.brief;
    if (body.overlayStyle !== undefined) updateData.overlayStyle = body.overlayStyle;
    if (body.staggerSeconds !== undefined) updateData.staggerSeconds = body.staggerSeconds;
    if (body.renderQuality !== undefined) updateData.renderQuality = body.renderQuality;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const project = await (prisma.project as any).update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ project });
  } catch (error: any) {
    console.error('Project update error:', error);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

/**
 * DELETE /api/projects/[id] — Delete a project (cascades).
 * Only OWNER/ADMIN or the project creator can delete.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { userId, companyId, role } = authResult.auth;

  const { id } = await params;

  try {
    const existing = await (prisma.project as any).findUnique({
      where: { id },
      select: { companyId: true, userId: true },
    });

    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Only OWNER, ADMIN, or the creator can delete
    const isAdminOrOwner = role === 'OWNER' || role === 'ADMIN';
    const isCreator = existing.userId === userId;
    if (!isAdminOrOwner && !isCreator) {
      return NextResponse.json({ error: 'Insufficient permissions to delete this project' }, { status: 403 });
    }

    await (prisma.project as any).delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Project delete error:', error);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
