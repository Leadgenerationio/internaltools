import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/onboarding — Returns onboarding checklist status for the current user.
 * Lightweight COUNT-based queries to check progress milestones.
 */
export async function GET() {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId } = authResult.auth;

  try {
    // Run all count queries in parallel for speed
    const [adCount, approvedAdCount, videoCount, renderCount, userCreatedAt] =
      await Promise.all([
        (prisma.projectAd as any).count({
          where: { project: { companyId } },
        }),
        (prisma.projectAd as any).count({
          where: { project: { companyId }, approved: true },
        }),
        (prisma.projectVideo as any).count({
          where: { project: { companyId } },
        }),
        (prisma.renderedOutput as any).count({
          where: { project: { companyId } },
        }),
        // Get the oldest user in this company to determine company age
        (prisma.user as any).findFirst({
          where: { companyId },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }),
      ]);

    const accountCreatedAt = userCreatedAt?.createdAt
      ? new Date(userCreatedAt.createdAt).toISOString()
      : null;

    return NextResponse.json({
      hasAds: adCount > 0,
      hasApprovedAds: approvedAdCount > 0,
      hasVideos: videoCount > 0,
      hasRenders: renderCount > 0,
      accountCreatedAt,
    });
  } catch (error: any) {
    console.error('Onboarding status error:', error);
    return NextResponse.json(
      { error: 'Failed to load onboarding status' },
      { status: 500 }
    );
  }
}
