import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/templates/[id]/use — Create a new project from a template.
 * Increments the template's useCount.
 * Body: { name?: string } — optional project name override.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { userId, companyId } = authResult.auth;

  const { id } = await params;

  try {
    // Parse optional body
    let projectName: string | undefined;
    try {
      const rawBody = await request.text();
      if (rawBody) {
        const body = JSON.parse(rawBody);
        projectName = body.name;
      }
    } catch {
      // No body or invalid JSON — that's fine, we'll use the template name
    }

    // Fetch the template (must be system or belong to user's company)
    const template = await (prisma.projectTemplate as any).findUnique({
      where: { id },
    });

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    // Verify access: system template or same company
    if (!template.isSystem && template.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    // Create project from template + increment useCount in a transaction
    const result = await (prisma as any).$transaction(async (tx: any) => {
      // Increment useCount
      await tx.projectTemplate.update({
        where: { id },
        data: { useCount: { increment: 1 } },
      });

      // Create the project
      const project = await tx.project.create({
        data: {
          name: projectName?.trim() || template.name,
          companyId,
          userId,
          brief: template.brief,
          overlayStyle: template.overlayStyle,
          staggerSeconds: template.staggerSeconds,
          renderQuality: 'final',
        },
      });

      return project;
    });

    return NextResponse.json({ project: result }, { status: 201 });
  } catch (error: any) {
    console.error('Template use error:', error);
    return NextResponse.json(
      { error: 'Failed to create project from template' },
      { status: 500 }
    );
  }
}
