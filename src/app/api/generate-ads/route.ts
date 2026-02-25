import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { AdBrief, FunnelStage } from '@/lib/types';

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are an expert Facebook/Meta ad copywriter. You create short, punchy text overlays for vertical video ads (9:16 format like Reels/TikTok).

Each ad consists of 4-5 text boxes that appear one at a time over a background video. Each text box is a short line (1-2 sentences max, ideally under 10 words). They build on each other to tell a story and drive action.

Rules:
- Keep each text box SHORT — these are overlays on video, not paragraphs
- Use curiosity gaps, pattern interrupts, and emotional hooks
- Never include hashtags or URLs in the text boxes
- Never include any branding for the ad platform — only the advertiser's product/service
- Each variation should feel genuinely different, not just rephrased
- Match the tone/style requested in the brief
- EMOJI RULE: Follow the emoji instruction in the user's brief exactly. If emojis are requested, start EVERY text box with a single relevant emoji. If emojis are not requested, do NOT include any emojis anywhere.

Funnel stages:
- TOFU (Top of Funnel): Awareness. Hook cold audiences. Spark curiosity. Make them stop scrolling. Use bold claims, surprising stats, relatable pain points, or provocative questions.
- MOFU (Middle of Funnel): Consideration. Build trust with warm audiences. Educate, show social proof, explain the process, address objections.
- BOFU (Bottom of Funnel): Conversion. Drive action with hot audiences. Create urgency, make clear CTAs, reinforce the offer, overcome final hesitations.`;

function buildBriefContext(brief: AdBrief): string {
  let ctx = `**Product/Service:** ${brief.productService}\n`;
  if (brief.targetAudience) ctx += `**Target Audience:** ${brief.targetAudience}\n`;
  if (brief.sellingPoints) ctx += `**Key Selling Points:** ${brief.sellingPoints}\n`;
  if (brief.adExamples) ctx += `**Examples of Ads That Have Worked:** ${brief.adExamples}\n`;
  if (brief.toneStyle) ctx += `**Tone & Style:** ${brief.toneStyle}\n`;
  if (brief.additionalContext) ctx += `**Additional Context:** ${brief.additionalContext}\n`;
  if (brief.addEmojis) {
    ctx += `**Emojis:** YES — start every text box with a single relevant emoji (e.g. "☀️ Save on energy bills")\n`;
  } else {
    ctx += `**Emojis:** NO — do not include any emojis in the text boxes\n`;
  }
  return ctx;
}

function buildUserPrompt(brief: AdBrief): string {
  return `Generate ad copy for the following brief:\n\n${buildBriefContext(brief)}
Generate exactly:
- 4 TOFU (Top of Funnel) ad variations
- 4 MOFU (Middle of Funnel) ad variations
- 2 BOFU (Bottom of Funnel) ad variations

Each ad should have 4-5 text boxes.

Respond with ONLY valid JSON in this exact format (no markdown, no code fences):
{
  "ads": [
    {
      "funnelStage": "tofu",
      "textBoxes": ["Text box 1", "Text box 2", "Text box 3", "Text box 4", "Text box 5"]
    }
  ]
}`;
}

function buildSingleAdPrompt(brief: AdBrief, stage: FunnelStage): string {
  const stageLabel = stage === 'tofu' ? 'TOFU (Top of Funnel — awareness, hook cold audiences)'
    : stage === 'mofu' ? 'MOFU (Middle of Funnel — build trust, educate)'
    : 'BOFU (Bottom of Funnel — drive action, create urgency)';

  return `Generate ad copy for the following brief:\n\n${buildBriefContext(brief)}
Generate exactly 1 ${stageLabel} ad variation with 4-5 text boxes.

Respond with ONLY valid JSON (no markdown, no code fences):
{
  "ads": [
    {
      "funnelStage": "${stage}",
      "textBoxes": ["Text box 1", "Text box 2", "Text box 3", "Text box 4"]
    }
  ]
}`;
}

function extractJson(text: string): any {
  // Try direct parse first
  try {
    return JSON.parse(text.trim());
  } catch { /* try cleaning */ }

  // Strip markdown code fences
  const stripped = text.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '').trim();
  try {
    return JSON.parse(stripped);
  } catch { /* try extracting */ }

  // Find JSON object in text
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch { /* give up */ }
  }

  throw new Error('Could not parse AI response as JSON. Try regenerating.');
}

async function callClaude(userPrompt: string): Promise<{
  ads: { funnelStage: FunnelStage; textBoxes: string[] }[];
  tokensUsed: { input: number; output: number };
}> {
  const client = new Anthropic();

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  const parsed = extractJson(text);
  const tokensUsed = {
    input: message.usage.input_tokens,
    output: message.usage.output_tokens,
  };

  return { ...parsed, tokensUsed };
}

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not set. Add it to .env.local' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { brief, regenerateStage } = body as {
      brief: AdBrief;
      regenerateStage?: FunnelStage;
    };

    if (!brief || !brief.productService?.trim()) {
      return NextResponse.json({ error: 'Product/service is required' }, { status: 400 });
    }

    let result;
    if (regenerateStage) {
      const validStages: FunnelStage[] = ['tofu', 'mofu', 'bofu'];
      if (!validStages.includes(regenerateStage)) {
        return NextResponse.json({ error: 'Invalid funnel stage' }, { status: 400 });
      }
      result = await callClaude(buildSingleAdPrompt(brief, regenerateStage));
    } else {
      result = await callClaude(buildUserPrompt(brief));
    }

    // Log token usage
    console.log('[generate-ads] Tokens used:', result.tokensUsed);

    if (!result.ads || !Array.isArray(result.ads)) {
      return NextResponse.json({ error: 'Invalid response from AI — missing ads array. Try again.' }, { status: 500 });
    }

    // Validate each ad has textBoxes
    for (const ad of result.ads) {
      if (!ad.textBoxes || !Array.isArray(ad.textBoxes) || ad.textBoxes.length === 0) {
        return NextResponse.json({ error: 'AI returned an ad with no text boxes. Try again.' }, { status: 500 });
      }
    }

    return NextResponse.json({ ads: result.ads, tokensUsed: result.tokensUsed });
  } catch (error: any) {
    console.error('Generate ads error:', error);

    // Give user-friendly messages for common errors
    if (error.status === 401) {
      return NextResponse.json({ error: 'Invalid API key. Check ANTHROPIC_API_KEY in .env.local' }, { status: 500 });
    }
    if (error.status === 429) {
      return NextResponse.json({ error: 'Rate limited by Anthropic API. Wait a moment and try again.' }, { status: 429 });
    }

    return NextResponse.json({ error: error.message || 'Generation failed' }, { status: 500 });
  }
}
