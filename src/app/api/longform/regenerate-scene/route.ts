/**
 * POST /api/longform/regenerate-scene
 *
 * Regenerate a single b-roll scene clip with a new prompt.
 * Enqueues a scene-regen job on the longform queue and returns jobId.
 * Deducts tokens for one video generation (model-specific cost).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { checkTokenBalance } from '@/lib/check-limits';
import { deductTokens } from '@/lib/token-balance';
import { getLongformQueue, isQueueAvailable } from '@/lib/queue';
import { VIDEO_MODELS } from '@/lib/types';

export const maxDuration = 30;

interface RequestBody {
  prompt: string;
  videoModel: string;
}

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId, userId } = authResult.auth;

  if (!isQueueAvailable()) {
    return NextResponse.json({ error: 'Background processing required (Redis not configured)' }, { status: 503 });
  }

  const body: RequestBody = await request.json();
  const { prompt, videoModel } = body;

  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
  }

  const model = VIDEO_MODELS.find((m) => m.id === videoModel);
  if (!model) {
    return NextResponse.json({ error: 'Invalid video model' }, { status: 400 });
  }

  const tokenCost = model.tokenCost;

  const balanceError = await checkTokenBalance(companyId, tokenCost);
  if (balanceError) return balanceError;

  const deductResult = await deductTokens({
    companyId,
    userId,
    amount: tokenCost,
    reason: 'RENDER',
    description: `Scene regen: ${model.label} (${tokenCost} tokens)`,
  });

  if (!deductResult.success) {
    return NextResponse.json({ error: 'Insufficient token balance' }, { status: 402 });
  }

  const queue = getLongformQueue();
  if (!queue) {
    const { refundTokens } = await import('@/lib/token-balance');
    await refundTokens({ companyId, userId, amount: tokenCost, description: 'Refund: queue unavailable' });
    return NextResponse.json({ error: 'Job queue not available' }, { status: 503 });
  }

  const job = await queue.add('longform-scene-regen', {
    companyId,
    userId,
    prompt: prompt.trim(),
    videoModel,
    tokenCost,
  });

  return NextResponse.json({
    jobId: job.id,
    type: 'longform',
    tokenCost,
  });
}
