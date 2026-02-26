import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

/**
 * DELETE /api/templates/[id] — Delete a company template.
 * Only company templates can be deleted (not system templates).
 * Only OWNER/ADMIN can delete.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId, role } = authResult.auth;

  const { id } = await params;

  // Only OWNER/ADMIN can delete templates
  if (role !== 'OWNER' && role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Only admins can delete templates' },
      { status: 403 }
    );
  }

  try {
    const template = await (prisma.projectTemplate as any).findUnique({
      where: { id },
      select: { companyId: true, isSystem: true },
    });

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    if (template.isSystem) {
      return NextResponse.json(
        { error: 'System templates cannot be deleted' },
        { status: 403 }
      );
    }

    if (template.companyId !== companyId) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    await (prisma.projectTemplate as any).delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Template delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete template' },
      { status: 500 }
    );
  }
}
