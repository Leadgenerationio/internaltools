/**
 * DELETE /api/avatar/library/[id]
 *
 * Delete an avatar from the company's library.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId } = authResult.auth;

  const avatarId = params.id;
  if (!avatarId) {
    return NextResponse.json({ error: 'Avatar ID is required' }, { status: 400 });
  }

  try {
    // Verify avatar belongs to this company before deleting
    const avatar = await prisma.avatar.findFirst({
      where: { id: avatarId, companyId },
      select: { id: true },
    });

    if (!avatar) {
      return NextResponse.json({ error: 'Avatar not found' }, { status: 404 });
    }

    await prisma.avatar.delete({ where: { id: avatarId } });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to delete avatar' },
      { status: 500 },
    );
  }
}
