import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

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
