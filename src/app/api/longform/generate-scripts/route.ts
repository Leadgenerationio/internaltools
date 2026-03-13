/**
 * POST /api/longform/generate-scripts
 *
 * Generate UGC ad scripts using Claude.
 *
 * Accepts two formats:
 * - V2 (new wizard): { prompt: string, numScripts: number, language?: string }
 *   → Returns { scripts: LongformScriptV2[] } with scene-aware structure
 * - Legacy: { productService, targetAudience, ... } (LongformBrief)
 *   → Returns { scripts: LongformScript[] } with hook/body/cta structure
 *
 * Free operation (0 tokens) — same as ad copy generation.
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import { getAuthContext } from '@/lib/api-auth';
import { trackAnthropicUsage } from '@/lib/track-usage';
import type { LongformBrief, LongformScript, LongformScriptV2 } from '@/lib/longform-types';

export const maxDuration = 60;

// ─── V2 system prompt (scene-aware scripts from freeform prompt) ────────────

const SYSTEM_PROMPT_V2 = `You are an expert direct-response ad copywriter specialising in
short-form vertical video ads (TikTok, Reels, YouTube Shorts). You write scripts
for UGC-style ads that stop the scroll and generate leads.

Given a user's freeform prompt, generate the requested number of UNIQUE ad script variants.
Each variant MUST take a distinctly different creative angle (e.g. pain-point, social-proof,
urgency, curiosity, transformation, before-after, testimonial-style, question-led).

CRITICAL — SCENE RULES:
Each script MUST be split into scenes of EXACTLY 8 seconds each. Each scene corresponds to
one AI-generated video clip which is always 8 seconds long. This means:
- At ~150 words per minute speaking rate, each scene should contain ~20 words of script text
- A 24-second script = 3 scenes, a 32-second script = 4 scenes, a 40-second script = 5 scenes
- Every scene's "durationEstimate" MUST be 8
- ALL text must be distributed across scenes — every word of fullText must appear in exactly one scene
- Scene breaks should be at natural sentence boundaries — do NOT split mid-sentence
- Adjust sentence lengths so each scene's text is close to ~20 words

Return your output as a JSON array. Each object has:
  - "variant": a short label (e.g. "pain-point", "social-proof")
  - "fullText": the complete script text as one paragraph
  - "scenes": an array of scene objects, each with:
    - "text": the exact portion of the script for this scene (all scene texts joined with spaces = fullText)
    - "visualPrompt": a short description of a suitable b-roll video clip for this scene (cinematic, vertical, descriptive — these will be used to generate AI video)
    - "durationEstimate": 8 (always 8 seconds — one AI video clip per scene)

Guidelines:
- Make every variant GENUINELY different — different hooks, angles, structures, emotional appeals
- Write conversationally — short punchy sentences, like a real person talking to camera
- Each script should be 24-40 seconds total when spoken (3-5 scenes of 8 seconds each)
- Visual prompts should be specific and cinematic — describe the shot, lighting, motion
- Each scene's text MUST be roughly 20 words (15-25 words acceptable) — this is critical for timing

Return ONLY the JSON array — no markdown, no code fences, no explanation.`;

// ─── Legacy system prompt (hook/body/cta structure) ─────────────────────────

const SYSTEM_PROMPT_LEGACY = `You are an expert direct-response ad copywriter specialising in
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

function buildLegacyPrompt(brief: LongformBrief): string {
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

function buildV2Prompt(prompt: string, numScripts: number, language: string): string {
  const parts = [
    `Generate ${numScripts} UNIQUE ad script variants based on this prompt:`,
    '',
    `"${prompt}"`,
    '',
    language !== 'English' ? `Write ALL scripts in ${language}. Do not use English.` : '',
    '',
    `Remember: each variant must be genuinely different — different hooks, angles, and approaches.`,
  ];
  return parts.filter(Boolean).join('\n');
}

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId, userId } = authResult.auth;

  const body = await request.json();

  // Detect format: V2 has "prompt" field, legacy has "productService"
  const isV2 = typeof body.prompt === 'string' && !body.productService;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
  }

  if (isV2) {
    return handleV2(body, companyId, userId, apiKey);
  }
  return handleLegacy(body, companyId, userId, apiKey);
}

// ─── V2 handler (freeform prompt → scene-aware scripts) ─────────────────────

async function handleV2(
  body: { prompt: string; numScripts?: number; language?: string },
  companyId: string,
  userId: string,
  apiKey: string,
) {
  const { prompt } = body;
  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
  }

  const numScripts = Math.min(Math.max(body.numScripts || 3, 1), 5);
  const language = body.language || 'English';

  const startTime = Date.now();
  const model = 'claude-sonnet-4-20250514';

  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system: SYSTEM_PROMPT_V2,
      messages: [{ role: 'user', content: buildV2Prompt(prompt, numScripts, language) }],
    });

    const text = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('');

    let rawScripts: any[];
    try {
      const parsed = JSON.parse(text);
      rawScripts = Array.isArray(parsed)
        ? parsed
        : parsed.scripts || parsed.variants || Object.values(parsed)[0];
    } catch {
      return NextResponse.json({ error: 'AI returned invalid JSON' }, { status: 502 });
    }

    // Validate and normalize V2 structure
    const scripts: LongformScriptV2[] = rawScripts.map((s: any) => ({
      id: crypto.randomUUID(),
      variant: s.variant || 'default',
      fullText: s.fullText || s.full_text || '',
      scenes: (Array.isArray(s.scenes) ? s.scenes : []).map((sc: any, idx: number) => ({
        id: crypto.randomUUID(),
        order: idx,
        text: sc.text || '',
        visualPrompt: sc.visualPrompt || sc.visual_prompt || '',
        durationEstimate: 8, // Always 8s — matches AI video clip duration
        source: 'empty' as const,
      })),
    }));

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
      model: 'claude-sonnet-4-20250514',
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

// ─── Legacy handler (structured brief → hook/body/cta scripts) ──────────────

async function handleLegacy(
  body: any,
  companyId: string,
  userId: string,
  apiKey: string,
) {
  const brief = body as LongformBrief;

  if (!brief.productService) {
    return NextResponse.json({ error: 'productService is required' }, { status: 400 });
  }

  const numVariants = Math.min(Math.max(brief.numVariants || 3, 1), 4);
  brief.numVariants = numVariants;
  brief.language = brief.language || 'English';

  const startTime = Date.now();
  const model = 'claude-sonnet-4-20250514';

  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT_LEGACY,
      messages: [{ role: 'user', content: buildLegacyPrompt(brief) }],
    });

    const text = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('');

    let scripts: LongformScript[];
    try {
      const parsed = JSON.parse(text);
      scripts = Array.isArray(parsed)
        ? parsed
        : parsed.scripts || parsed.variants || Object.values(parsed)[0];
    } catch {
      return NextResponse.json({ error: 'AI returned invalid JSON' }, { status: 502 });
    }

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
