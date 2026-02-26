import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/projects/[id]/duplicate — Deep copy a project.
 * Copies: brief, overlayStyle, staggerSeconds, renderQuality, ads (reset to unapproved).
 * Does NOT copy: videos, music, renders (file-based resources).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { userId, companyId } = authResult.auth;

  const { id } = await params;

  try {
    // Fetch the original project with ads
    const original = await (prisma.project as any).findUnique({
      where: { id },
      include: {
        ads: {
          select: {
            funnelStage: true,
            variationLabel: true,
            textBoxes: true,
          },
        },
      },
    });

    if (!original || original.companyId !== companyId) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Create the duplicate in a transaction
    const duplicate = await (prisma as any).$transaction(async (tx: any) => {
      // Create the new project
      const newProject = await tx.project.create({
        data: {
          name: `${original.name} (Copy)`,
          companyId,
          userId,
          brief: original.brief,
          overlayStyle: original.overlayStyle,
          staggerSeconds: original.staggerSeconds,
          renderQuality: original.renderQuality,
        },
      });

      // Copy all ads with approved reset to false
      if (original.ads.length > 0) {
        await tx.projectAd.createMany({
          data: original.ads.map((ad: any) => ({
            projectId: newProject.id,
            funnelStage: ad.funnelStage,
            variationLabel: ad.variationLabel,
            textBoxes: ad.textBoxes,
            approved: false,
          })),
        });
      }

      // Return with counts for the response
      const adCount = original.ads.length;

      return {
        id: newProject.id,
        name: newProject.name,
        brief: newProject.brief,
        updatedAt: newProject.updatedAt,
        createdAt: newProject.createdAt,
        adCount,
        videoCount: 0,
        renderCount: 0,
      };
    });

    return NextResponse.json({ project: duplicate }, { status: 201 });
  } catch (error: any) {
    console.error('Project duplicate error:', error);
    return NextResponse.json(
      { error: 'Failed to duplicate project' },
      { status: 500 }
    );
  }
}
