import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

// PATCH /api/media/[id] — rename or tag a media file
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId } = authResult.auth;

  const { id } = params;
  const body = await request.json();
  const { name, tag } = body;

  try {
    const file = await prisma.storageFile.findFirst({
      where: { id, companyId },
    });
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const updates: any = {};
    if (typeof name === 'string' && name.trim()) updates.originalName = name.trim();
    if (typeof tag === 'string') updates.tag = tag || null; // empty string = clear tag

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No changes' }, { status: 400 });
    }

    const updated = await prisma.storageFile.update({ where: { id }, data: updates });
    return NextResponse.json({ success: true, file: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Update failed' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId } = authResult.auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Missing file ID' }, { status: 400 });
  }

  try {
    // Verify the file belongs to this company
    const file = await prisma.storageFile.findFirst({
      where: { id, companyId },
      select: { id: true, storagePath: true },
    });

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Delete the DB record (cascade will handle relations)
    await prisma.storageFile.delete({ where: { id } });

    // Best-effort delete from storage
    try {
      const { deleteFile } = await import('@/lib/storage');
      await deleteFile(file.storagePath);
    } catch { /* non-fatal — file may already be cleaned up */ }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Delete failed' }, { status: 500 });
  }
}
