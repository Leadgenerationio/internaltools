/**
 * POST /api/avatar/generate-video
 *
 * Enqueue avatar video generation via BullMQ.
 * Deducts AVATAR_VIDEO (10) tokens upfront.
 * Returns { jobId } for polling via /api/jobs/[id]?type=avatar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { checkTokenBalance } from '@/lib/check-limits';
import { deductTokens, refundTokens } from '@/lib/token-balance';
import { getAvatarQueue } from '@/lib/queue';
import { TOKEN_COSTS } from '@/lib/token-pricing';
import type { AvatarVideoGenData } from '@/lib/job-types';

export const maxDuration = 300;

interface RequestBody {
  avatarImageUrl: string;
  voiceoverUrl: string;
}

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId, userId } = authResult.auth;

  const body: RequestBody = await request.json();
  const { avatarImageUrl, voiceoverUrl } = body;

  if (!avatarImageUrl?.trim()) {
    return NextResponse.json({ error: 'Avatar image URL is required' }, { status: 400 });
  }
  if (!voiceoverUrl?.trim()) {
    return NextResponse.json({ error: 'Voiceover URL is required' }, { status: 400 });
  }

  const tokenCost = TOKEN_COSTS.AVATAR_VIDEO;

  const balanceError = await checkTokenBalance(companyId, tokenCost);
  if (balanceError) return balanceError;

  const queue = getAvatarQueue();
  if (!queue) {
    return NextResponse.json(
      { error: 'Background job queue is not available. Avatar video generation requires Redis/BullMQ.' },
      { status: 503 },
    );
  }

  const deductResult = await deductTokens({
    companyId,
    userId,
    amount: tokenCost,
    reason: 'RENDER',
    description: `Avatar video generation (${tokenCost} tokens)`,
  });

  if (!deductResult.success) {
    return NextResponse.json({ error: 'Insufficient token balance' }, { status: 402 });
  }

  try {
    const jobData: AvatarVideoGenData = {
      companyId,
      userId,
      avatarImageUrl: avatarImageUrl.trim(),
      voiceoverUrl: voiceoverUrl.trim(),
      tokenCost,
    };

    const job = await queue.add('avatar-generate-video', jobData, {
      attempts: 1,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 3600 },
    });

    return NextResponse.json({ jobId: job.id });
  } catch (err: any) {
    // Refund tokens if we couldn't enqueue
    await refundTokens({
      companyId,
      userId,
      amount: tokenCost,
      description: `Refund: avatar video enqueue failed — ${err.message}`,
    }).catch(() => {});

    return NextResponse.json(
      { error: err.message || 'Failed to enqueue avatar video generation' },
      { status: 500 },
    );
  }
}
