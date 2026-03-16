/**
 * POST /api/avatar/generate-voiceover
 *
 * Generate voiceover audio for avatar script using ElevenLabs TTS.
 * Synchronous — TTS takes 5-15 seconds.
 * Deducts AVATAR_VOICEOVER (2) tokens.
 */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { getAuthContext } from '@/lib/api-auth';
import { checkTokenBalance } from '@/lib/check-limits';
import { deductTokens, refundTokens } from '@/lib/token-balance';
import { generateSpeech } from '@/lib/elevenlabs';
import { getMediaDuration } from '@/lib/longform-stitcher';
import { fileUrl } from '@/lib/file-url';
import { TOKEN_COSTS } from '@/lib/token-pricing';
import type { VoiceoverConfig } from '@/lib/longform-types';

export const maxDuration = 60;

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'outputs');

interface RequestBody {
  script: string;
  voiceId: string;
}

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId, userId } = authResult.auth;

  const body: RequestBody = await request.json();
  const { script, voiceId } = body;

  if (!script?.trim()) {
    return NextResponse.json({ error: 'Script text is required' }, { status: 400 });
  }
  if (!voiceId?.trim()) {
    return NextResponse.json({ error: 'Voice ID is required' }, { status: 400 });
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: 'ElevenLabs not configured' }, { status: 503 });
  }

  const tokenCost = TOKEN_COSTS.AVATAR_VOICEOVER;

  const balanceError = await checkTokenBalance(companyId, tokenCost);
  if (balanceError) return balanceError;

  const deductResult = await deductTokens({
    companyId,
    userId,
    amount: tokenCost,
    reason: 'RENDER',
    description: `Avatar voiceover (${tokenCost} tokens)`,
  });

  if (!deductResult.success) {
    return NextResponse.json({ error: 'Insufficient token balance' }, { status: 402 });
  }

  try {
    const voiceConfig: VoiceoverConfig = {
      voiceId,
      model: 'eleven_multilingual_v2',
      stability: 0.5,
      similarityBoost: 0.75,
      style: 0.0,
      speed: 1.0,
    };

    const audioBuffer = await generateSpeech(script.trim(), voiceConfig);

    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const filename = `avatar_vo_${crypto.randomUUID()}.mp3`;
    const filePath = path.join(OUTPUT_DIR, filename);
    await fs.writeFile(filePath, audioBuffer);

    // Upload to S3 if configured
    try {
      const { isCloudStorage, uploadFile } = await import('@/lib/storage');
      if (isCloudStorage) {
        await uploadFile(filePath, `outputs/${filename}`);
      }
    } catch { /* storage not configured — local file is fine */ }

    // Get duration via ffprobe
    let durationSeconds = 30;
    try {
      durationSeconds = await getMediaDuration(filePath);
    } catch { /* fallback duration */ }

    return NextResponse.json({
      voiceoverUrl: fileUrl(`outputs/${filename}`),
      durationSeconds,
      tokenCost,
    });
  } catch (err: any) {
    // Refund on failure
    await refundTokens({
      companyId,
      userId,
      amount: tokenCost,
      description: `Refund: avatar voiceover failed — ${err.message}`,
    }).catch(() => {});

    return NextResponse.json(
      { error: err.message || 'Voiceover generation failed' },
      { status: 500 },
    );
  }
}
