/**
 * POST /api/longform/reassemble
 *
 * Re-stitch scene clips + voiceover into a new final video.
 * Used after editing scenes in the post-generation editor.
 * No additional token cost (included in original generation).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { getLongformQueue, isQueueAvailable } from '@/lib/queue';
import type { CaptionConfig } from '@/lib/longform-types';

export const maxDuration = 30;

interface RequestBody {
  scenes: Array<{ clipUrl: string; order: number; prompt: string }>;
  voiceoverUrl: string;
  captionConfig: CaptionConfig;
  scriptText: string;
}

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId, userId } = authResult.auth;

  if (!isQueueAvailable()) {
    return NextResponse.json({ error: 'Background processing required (Redis not configured)' }, { status: 503 });
  }

  const body: RequestBody = await request.json();
  const { scenes, voiceoverUrl, captionConfig, scriptText } = body;

  if (!scenes || scenes.length === 0) {
    return NextResponse.json({ error: 'At least one scene is required' }, { status: 400 });
  }

  if (!voiceoverUrl) {
    return NextResponse.json({ error: 'Voiceover URL is required' }, { status: 400 });
  }

  const queue = getLongformQueue();
  if (!queue) {
    return NextResponse.json({ error: 'Job queue not available' }, { status: 503 });
  }

  const job = await queue.add('longform-reassemble', {
    companyId,
    userId,
    scenes: scenes.sort((a, b) => a.order - b.order),
    voiceoverUrl,
    captionConfig,
    scriptText,
  });

  return NextResponse.json({
    jobId: job.id,
    type: 'longform',
  });
}
