/**
 * POST /api/longform/finalize
 *
 * Assemble final longform videos from pre-built components:
 * voiceover audio + scene clips + music + captions + aspect ratio.
 *
 * Enqueues a longform-finalize BullMQ job.
 * Assembly is FREE — all costs (voiceover, scene generation) already paid incrementally.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { getLongformQueue, isQueueAvailable } from '@/lib/queue';
import type { LongformFinalizeData } from '@/lib/job-types';
import type { CaptionConfig } from '@/lib/longform-types';

export const maxDuration = 30;

interface RequestBody {
  variants: Array<{
    scriptId: string;
    variant: string;
    voiceoverUrl: string;
    scenes: Array<{ clipUrl: string; order: number }>;
  }>;
  music: { url: string; volume: number } | null;
  captionConfig: CaptionConfig;
  aspectRatio: '9:16' | '16:9' | '1:1';
}

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId, userId } = authResult.auth;

  if (!isQueueAvailable()) {
    return NextResponse.json({ error: 'Background processing required (Redis not configured)' }, { status: 503 });
  }

  const body: RequestBody = await request.json();
  const { variants, music, captionConfig, aspectRatio } = body;

  if (!variants?.length) {
    return NextResponse.json({ error: 'At least one variant is required' }, { status: 400 });
  }

  // Validate each variant has voiceover and at least one scene
  for (const v of variants) {
    if (!v.voiceoverUrl) {
      return NextResponse.json({ error: `Variant "${v.variant}" is missing voiceover` }, { status: 400 });
    }
    if (!v.scenes?.length) {
      return NextResponse.json({ error: `Variant "${v.variant}" has no scenes` }, { status: 400 });
    }
    for (const s of v.scenes) {
      if (!s.clipUrl) {
        return NextResponse.json({ error: `Variant "${v.variant}" has an empty scene slot` }, { status: 400 });
      }
    }
  }

  if (captionConfig?.enabled && !process.env.SUBMAGIC_API_KEY) {
    return NextResponse.json({
      error: 'Captions enabled but SUBMAGIC_API_KEY is not configured',
    }, { status: 503 });
  }

  const queue = getLongformQueue();
  if (!queue) {
    return NextResponse.json({ error: 'Job queue not available' }, { status: 503 });
  }

  const jobData: LongformFinalizeData = {
    companyId,
    userId,
    variants,
    music,
    captionConfig,
    aspectRatio: aspectRatio || '9:16',
  };

  const job = await queue.add('longform-finalize', jobData);

  return NextResponse.json({
    jobId: job.id,
    type: 'longform',
  });
}
