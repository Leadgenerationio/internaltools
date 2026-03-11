/**
 * POST /api/longform/generate
 *
 * Enqueue a longform video generation job.
 * Deducts tokens upfront, enqueues to BullMQ, returns jobId.
 *
 * Longform requires background processing (Redis/BullMQ) because
 * the pipeline takes 5-15 minutes per variant.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { checkTokenBalance } from '@/lib/check-limits';
import { deductTokens } from '@/lib/token-balance';
import { calculateLongformTokens } from '@/lib/token-pricing';
import { getLongformQueue, isQueueAvailable } from '@/lib/queue';
import type { LongformScript, VoiceoverConfig, CaptionConfig } from '@/lib/longform-types';

export const maxDuration = 30;

interface RequestBody {
  scripts: LongformScript[];
  voiceConfig: VoiceoverConfig;
  captionConfig: CaptionConfig;
  skipBroll: boolean;
  videoModel?: string;
  hookClipPath?: string;
}

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId, userId } = authResult.auth;

  // Longform requires background processing
  if (!isQueueAvailable()) {
    return NextResponse.json(
      { error: 'Longform video requires background processing (Redis not configured)' },
      { status: 503 },
    );
  }

  const body: RequestBody = await request.json();
  const { scripts, voiceConfig, captionConfig, skipBroll, videoModel, hookClipPath } = body;

  if (!scripts || scripts.length === 0) {
    return NextResponse.json({ error: 'At least one script is required' }, { status: 400 });
  }

  if (scripts.length > 4) {
    return NextResponse.json({ error: 'Maximum 4 variants per job' }, { status: 400 });
  }

  // Validate scripts have required fields (hook and cta are optional for pasted scripts)
  for (const s of scripts) {
    if (!s.body) {
      return NextResponse.json({ error: `Script "${s.variant}" is missing a body` }, { status: 400 });
    }
  }

  // Calculate and check token cost (model-aware pricing)
  const tokenCost = calculateLongformTokens(scripts.length, skipBroll, videoModel);

  const balanceError = await checkTokenBalance(companyId, tokenCost);
  if (balanceError) return balanceError;

  // Deduct tokens upfront (atomic)
  const deductResult = await deductTokens({
    companyId,
    userId,
    amount: tokenCost,
    reason: 'RENDER',
    description: `Longform video: ${scripts.length} variant${scripts.length !== 1 ? 's' : ''}${skipBroll ? '' : ' + AI b-roll'}`,
  });

  if (!deductResult.success) {
    return NextResponse.json({ error: 'Insufficient token balance' }, { status: 402 });
  }

  // Enqueue job
  const queue = getLongformQueue();
  if (!queue) {
    // Refund — queue became unavailable between check and enqueue
    const { refundTokens } = await import('@/lib/token-balance');
    await refundTokens({
      companyId,
      userId,
      amount: tokenCost,
      description: 'Refund: longform queue unavailable',
    });
    return NextResponse.json({ error: 'Job queue not available' }, { status: 503 });
  }

  const job = await queue.add('longform-video', {
    companyId,
    userId,
    scripts,
    voiceConfig,
    captionConfig,
    skipBroll,
    videoModel,
    hookClipPath,
    tokenCost,
  });

  return NextResponse.json({
    jobId: job.id,
    type: 'longform',
    tokenCost,
    variantCount: scripts.length,
  });
}
