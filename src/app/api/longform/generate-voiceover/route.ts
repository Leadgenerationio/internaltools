/**
 * POST /api/longform/generate-voiceover
 *
 * Generate voiceover audio for a script using ElevenLabs TTS.
 * Synchronous — TTS takes 5-15 seconds, no BullMQ needed.
 * Deducts 2 tokens per voiceover.
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

export const maxDuration = 30;

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'outputs');

interface RequestBody {
  scriptId: string;
  scriptText: string;
  voiceConfig: VoiceoverConfig;
}

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId, userId } = authResult.auth;

  const body: RequestBody = await request.json();
  const { scriptId, scriptText, voiceConfig } = body;

  if (!scriptText?.trim()) {
    return NextResponse.json({ error: 'Script text is required' }, { status: 400 });
  }
  if (!voiceConfig?.voiceId) {
    return NextResponse.json({ error: 'Voice config with voiceId is required' }, { status: 400 });
  }

  const tokenCost = TOKEN_COSTS.LONGFORM_VOICEOVER;

  const balanceError = await checkTokenBalance(companyId, tokenCost);
  if (balanceError) return balanceError;

  const deductResult = await deductTokens({
    companyId,
    userId,
    amount: tokenCost,
    reason: 'RENDER',
    description: `Longform voiceover (${tokenCost} tokens)`,
  });

  if (!deductResult.success) {
    return NextResponse.json({ error: 'Insufficient token balance' }, { status: 402 });
  }

  try {
    const audioBuffer = await generateSpeech(scriptText.trim(), voiceConfig);

    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const filename = `longform_vo_${crypto.randomUUID()}.mp3`;
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
      description: `Refund: voiceover failed — ${err.message}`,
    }).catch(() => {});

    return NextResponse.json(
      { error: err.message || 'Voiceover generation failed' },
      { status: 500 },
    );
  }
}
