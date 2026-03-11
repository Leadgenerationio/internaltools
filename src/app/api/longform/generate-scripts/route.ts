/**
 * POST /api/longform/generate-scripts
 *
 * Generate UGC ad scripts from a brief using Claude.
 * Returns an array of LongformScript objects (hook/body/cta per variant).
 * Free operation (0 tokens) — same as ad copy generation.
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthContext } from '@/lib/api-auth';
import { trackAnthropicUsage } from '@/lib/track-usage';
import type { LongformBrief, LongformScript } from '@/lib/longform-types';

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are an expert direct-response ad copywriter specialising in
short-form vertical video ads (TikTok, Reels, YouTube Shorts). You write scripts
for UGC-style ads that generate leads.

Every script you produce MUST follow this exact structure:

1. HOOK (2-5 seconds when spoken aloud)
   - A bold, scroll-stopping opening line that calls out the target audience.
   - Example: "If you own a home in the UK, watch this."

2. BODY (15-25 seconds when spoken aloud)
   - Delivered in a conversational, relatable tone.
   - Explain the offer/benefit clearly.
   - Include social proof or urgency if possible.
   - Keep sentences short and punchy — this will be spoken aloud as a voiceover.

3. CTA (3-5 seconds when spoken aloud)
   - A clear call to action telling the viewer exactly what to do.
   - Example: "Drop your postcode below to see if you qualify."

Return your output as a JSON array of objects. Each object has:
  - "variant": a short label (e.g. "pain-point", "social-proof", "urgency")
  - "hook": the hook line
  - "body": the body script (one paragraph, to be spoken aloud)
  - "cta": the call-to-action line
  - "suggestedBroll": an array of 3-5 short scene descriptions for AI b-roll video clips

Return ONLY the JSON array — no markdown, no code fences, no explanation.`;

function buildPrompt(brief: LongformBrief): string {
  const parts = [
    `Generate ${brief.numVariants} different ad script variants for the following brief:`,
    '',
    `**Product/Service:** ${brief.productService}`,
    brief.targetAudience && `**Target Audience:** ${brief.targetAudience}`,
    brief.offer && `**Offer:** ${brief.offer}`,
    brief.keyBenefits && `**Key Benefits:** ${brief.keyBenefits}`,
    brief.cta && `**Desired CTA:** ${brief.cta}`,
    brief.tone && `**Tone:** ${brief.tone}`,
    brief.language !== 'English' && `**Language:** Write ALL scripts in ${brief.language}. Do not use English.`,
    '',
    'Each variant should take a different angle (e.g. pain-point, social-proof, urgency,',
    'curiosity, transformation). Make them sound natural and conversational — like a real',
    'person talking to camera, not a corporate ad.',
  ];
  return parts.filter(Boolean).join('\n');
}

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId, userId } = authResult.auth;

  const body = await request.json();
  const brief = body as LongformBrief;

  if (!brief.productService) {
    return NextResponse.json({ error: 'productService is required' }, { status: 400 });
  }

  const numVariants = Math.min(Math.max(brief.numVariants || 3, 1), 4);
  brief.numVariants = numVariants;
  brief.language = brief.language || 'English';

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
  }

  const startTime = Date.now();
  const model = 'claude-sonnet-4-20250514';

  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPrompt(brief) }],
    });

    const text = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('');

    // Parse JSON response
    let scripts: LongformScript[];
    try {
      const parsed = JSON.parse(text);
      scripts = Array.isArray(parsed)
        ? parsed
        : parsed.scripts || parsed.variants || Object.values(parsed)[0];
    } catch {
      return NextResponse.json({ error: 'AI returned invalid JSON' }, { status: 502 });
    }

    // Validate structure
    scripts = scripts.map((s: any) => ({
      variant: s.variant || 'default',
      hook: s.hook || '',
      body: s.body || '',
      cta: s.cta || '',
      suggestedBroll: Array.isArray(s.suggestedBroll)
        ? s.suggestedBroll
        : typeof s.suggested_broll === 'string'
          ? s.suggested_broll.split(',').map((b: string) => b.trim()).filter(Boolean)
          : Array.isArray(s.suggested_broll)
            ? s.suggested_broll
            : [],
    }));

    // Track usage (free, but log cost for admin)
    trackAnthropicUsage({
      companyId,
      userId,
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      endpoint: 'longform/generate-scripts',
      durationMs: Date.now() - startTime,
      success: true,
    });

    return NextResponse.json({ scripts });
  } catch (err: any) {
    trackAnthropicUsage({
      companyId,
      userId,
      model,
      inputTokens: 0,
      outputTokens: 0,
      endpoint: 'longform/generate-scripts',
      durationMs: Date.now() - startTime,
      success: false,
      errorMessage: err.message,
    });

    return NextResponse.json(
      { error: err.message || 'Script generation failed' },
      { status: 500 },
    );
  }
}
