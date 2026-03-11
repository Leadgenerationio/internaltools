/**
 * POST /api/longform/generate-hooks
 *
 * Generate hook variations for a user-provided script body.
 * Free operation (0 tokens).
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthContext } from '@/lib/api-auth';
import { trackAnthropicUsage } from '@/lib/track-usage';

export const maxDuration = 30;

const SYSTEM_PROMPT = `You are an expert direct-response ad copywriter. Given a script body for a UGC-style video ad, generate compelling hook options — the first 2-5 seconds that stop the scroll.

Rules:
- Each hook should be 1-2 short sentences (2-5 seconds when spoken aloud)
- Make them bold, attention-grabbing, scroll-stopping
- Call out the target audience or create curiosity
- Each hook should take a different angle (question, shocking stat, bold claim, fear-of-missing-out, relatable pain)
- They should flow naturally into the provided script body

Return ONLY a JSON array of strings — each string is one hook option.
Example: ["Stop scrolling if you own a home.", "Nobody is talking about this new scheme.", "This saved me £400 a month."]`;

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId, userId } = authResult.auth;

  const { scriptBody, count = 5 } = await request.json();

  if (!scriptBody || typeof scriptBody !== 'string' || scriptBody.trim().length < 10) {
    return NextResponse.json({ error: 'Script body is required (min 10 chars)' }, { status: 400 });
  }

  const numHooks = Math.min(Math.max(count, 1), 8);

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
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Generate ${numHooks} hook options for this ad script:\n\n"${scriptBody.trim()}"`,
      }],
    });

    const text = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('');

    let hooks: string[];
    try {
      hooks = JSON.parse(text);
      if (!Array.isArray(hooks)) throw new Error('Not an array');
      hooks = hooks.filter((h) => typeof h === 'string' && h.trim().length > 0);
    } catch {
      return NextResponse.json({ error: 'AI returned invalid response' }, { status: 502 });
    }

    trackAnthropicUsage({
      companyId,
      userId,
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      endpoint: 'longform/generate-hooks',
      durationMs: Date.now() - startTime,
      success: true,
    });

    return NextResponse.json({ hooks });
  } catch (err: any) {
    trackAnthropicUsage({
      companyId,
      userId,
      model,
      inputTokens: 0,
      outputTokens: 0,
      endpoint: 'longform/generate-hooks',
      durationMs: Date.now() - startTime,
      success: false,
      errorMessage: err.message,
    });

    return NextResponse.json(
      { error: err.message || 'Hook generation failed' },
      { status: 500 },
    );
  }
}
