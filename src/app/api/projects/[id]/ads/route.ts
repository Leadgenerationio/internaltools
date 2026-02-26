import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/projects/[id]/ads — Save ads to a project.
 * Deletes existing ads and replaces them with the new set.
 * Body: { ads: Array<{ funnelStage, variationLabel, textBoxes, approved }> }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId } = authResult.auth;

  const { id: projectId } = await params;

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

    const { ads } = body;

    if (!Array.isArray(ads)) {
      return NextResponse.json({ error: 'ads must be an array' }, { status: 400 });
    }

    if (ads.length > 100) {
      return NextResponse.json({ error: 'Too many ads (max 100)' }, { status: 400 });
    }

    // Verify project exists and belongs to this company
    const project = await (prisma.project as any).findUnique({
      where: { id: projectId },
      select: { companyId: true },
    });

    if (!project || project.companyId !== companyId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Validate each ad
    for (const ad of ads) {
      if (!ad.funnelStage || typeof ad.funnelStage !== 'string') {
        return NextResponse.json({ error: 'Each ad must have a funnelStage' }, { status: 400 });
      }
      if (!ad.variationLabel || typeof ad.variationLabel !== 'string') {
        return NextResponse.json({ error: 'Each ad must have a variationLabel' }, { status: 400 });
      }
      if (!Array.isArray(ad.textBoxes)) {
        return NextResponse.json({ error: 'Each ad must have a textBoxes array' }, { status: 400 });
      }
    }

    // Delete existing ads and create new ones in a transaction
    await (prisma as any).$transaction([
      (prisma.projectAd as any).deleteMany({ where: { projectId } }),
      ...(ads.map((ad: any) =>
        (prisma.projectAd as any).create({
          data: {
            projectId,
            funnelStage: ad.funnelStage,
            variationLabel: ad.variationLabel,
            textBoxes: ad.textBoxes,
            approved: ad.approved ?? false,
          },
        })
      )),
    ]);

    // Fetch the newly created ads to return
    const savedAds = await (prisma.projectAd as any).findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ ads: savedAds }, { status: 201 });
  } catch (error: any) {
    console.error('Project ads save error:', error);
    return NextResponse.json({ error: 'Failed to save ads' }, { status: 500 });
  }
}
