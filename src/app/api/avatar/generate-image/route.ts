/**
 * POST /api/avatar/generate-image
 *
 * Generate an avatar image using kie.ai Nano Banana 2.
 * Synchronous — takes ~30-60 seconds.
 * Deducts AVATAR_IMAGE (2) tokens.
 */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { getAuthContext } from '@/lib/api-auth';
import { checkTokenBalance } from '@/lib/check-limits';
import { deductTokens, refundTokens } from '@/lib/token-balance';
import { generateAvatarImage } from '@/lib/kie-image-api';
import { fileUrl } from '@/lib/file-url';
import { TOKEN_COSTS } from '@/lib/token-pricing';
import { logger } from '@/lib/logger';

export const maxDuration = 120;

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

interface RequestBody {
  prompt: string;
  referenceImageUrl?: string;
}

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId, userId } = authResult.auth;

  const body: RequestBody = await request.json();
  const { prompt, referenceImageUrl } = body;

  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
  }

  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'KIE_API_KEY not configured' }, { status: 503 });
  }

  const tokenCost = TOKEN_COSTS.AVATAR_IMAGE;

  const balanceError = await checkTokenBalance(companyId, tokenCost);
  if (balanceError) return balanceError;

  const deductResult = await deductTokens({
    companyId,
    userId,
    amount: tokenCost,
    reason: 'RENDER',
    description: `Avatar image generation (${tokenCost} tokens)`,
  });

  if (!deductResult.success) {
    return NextResponse.json({ error: 'Insufficient token balance' }, { status: 402 });
  }

  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const filename = `avatar_${crypto.randomUUID()}.png`;
    const outputPath = path.join(UPLOAD_DIR, filename);

    // Resolve reference image to a public URL that kie.ai can access
    let referenceUrls: string[] | undefined;
    if (referenceImageUrl) {
      let publicRefUrl = referenceImageUrl;
      if (!referenceImageUrl.startsWith('http')) {
        // Relative URL like /api/files?path=... — make absolute
        const cdnUrl = process.env.CDN_URL || process.env.S3_PUBLIC_URL;
        if (cdnUrl && referenceImageUrl.includes('/api/files')) {
          // Extract path param and use CDN directly
          try {
            const u = new URL(referenceImageUrl, 'http://localhost');
            const p = u.searchParams.get('path');
            if (p) publicRefUrl = `${cdnUrl.replace(/\/+$/, '')}/${p}`;
          } catch { /* fall through */ }
        }
        if (!publicRefUrl.startsWith('http')) {
          const base = process.env.APP_URL
            || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
            || 'http://localhost:3000';
          publicRefUrl = `${base.replace(/\/+$/, '')}${referenceImageUrl.startsWith('/') ? '' : '/'}${referenceImageUrl}`;
        }
      }
      referenceUrls = [publicRefUrl];
    }
    await generateAvatarImage(apiKey, prompt.trim(), outputPath, referenceUrls);

    // Upload to S3 if configured
    try {
      const { isCloudStorage, uploadFile } = await import('@/lib/storage');
      if (isCloudStorage) {
        await uploadFile(outputPath, `uploads/${filename}`);
      }
    } catch { /* storage not configured — local file is fine */ }

    logger.info(`[avatar] Image generated: ${filename}`);

    return NextResponse.json({
      imageUrl: fileUrl(`uploads/${filename}`),
      tokenCost,
    });
  } catch (err: any) {
    // Refund on failure
    await refundTokens({
      companyId,
      userId,
      amount: tokenCost,
      description: `Refund: avatar image generation failed — ${err.message}`,
    }).catch(() => {});

    logger.error(`[avatar] Image generation failed: ${err.message}`);

    return NextResponse.json(
      { error: err.message || 'Avatar image generation failed' },
      { status: 500 },
    );
  }
}
