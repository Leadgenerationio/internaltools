/**
 * ElevenLabs TTS client.
 *
 * Converts text to speech using the ElevenLabs API.
 * Used by the longform video pipeline for voiceover generation.
 *
 * Env: ELEVENLABS_API_KEY
 */

import type { VoiceoverConfig, LongformScript } from '@/lib/longform-types';

const BASE_URL = 'https://api.elevenlabs.io/v1';

function getApiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY not configured');
  return key;
}

// ─── Voice listing ──────────────────────────────────────────────────────────

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  labels: Record<string, string>;
  preview_url: string;
}

export async function listVoices(): Promise<ElevenLabsVoice[]> {
  const res = await fetch(`${BASE_URL}/voices`, {
    headers: { 'xi-api-key': getApiKey() },
  });
  if (!res.ok) throw new Error(`ElevenLabs voices failed (${res.status})`);
  const data = await res.json();
  return data.voices || [];
}

/**
 * Fetch popular shared/community voices from ElevenLabs voice library.
 */
export async function listSharedVoices(pageSize = 50): Promise<ElevenLabsVoice[]> {
  const params = new URLSearchParams({
    page_size: String(pageSize),
    sort: 'usage_character_count_7d',
    use_cases: 'social_media,narration,characters',
  });
  const res = await fetch(`${BASE_URL}/shared-voices?${params}`, {
    headers: { 'xi-api-key': getApiKey() },
  });
  if (!res.ok) return []; // non-critical — just return empty
  const data = await res.json();
  return (data.voices || []).map((v: any) => ({
    voice_id: v.voice_id,
    name: v.name,
    category: 'shared',
    labels: {
      accent: v.accent || '',
      gender: v.gender || '',
      age: v.age || '',
    },
    preview_url: v.preview_url || '',
  }));
}

// ─── TTS generation ─────────────────────────────────────────────────────────

/**
 * Generate speech audio from text. Returns raw audio bytes (MP3).
 */
export async function generateSpeech(
  text: string,
  config: VoiceoverConfig,
): Promise<Buffer> {
  const url = `${BASE_URL}/text-to-speech/${config.voiceId}?output_format=mp3_44100_128`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': getApiKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: config.model,
      voice_settings: {
        stability: config.stability,
        similarity_boost: config.similarityBoost,
        style: config.style,
        speed: config.speed,
      },
    }),
  });

  if (res.status === 429) throw new Error('ElevenLabs rate limit exceeded (429)');
  if (res.status === 401) throw new Error('ElevenLabs API key invalid (401)');
  if (res.status === 402) throw new Error('ElevenLabs insufficient credits (402)');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${body}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

/**
 * Generate voiceover for all segments of a script.
 * Returns paths to individual segment files and the full audio.
 */
export async function generateScriptVoiceover(
  script: LongformScript,
  config: VoiceoverConfig,
  outputDir: string,
): Promise<{ hookAudio: string; bodyAudio: string; ctaAudio: string; fullAudio: string }> {
  const fs = await import('fs/promises');
  const path = await import('path');

  await fs.mkdir(outputDir, { recursive: true });

  const variant = script.variant.replace(/[^a-zA-Z0-9_-]/g, '_');

  // Generate each non-empty segment
  const segments: { key: string; text: string; filename: string }[] = [
    { key: 'hook', text: script.hook || '', filename: `${variant}_hook.mp3` },
    { key: 'body', text: script.body, filename: `${variant}_body.mp3` },
    { key: 'cta', text: script.cta || '', filename: `${variant}_cta.mp3` },
  ].filter((s) => s.text.trim().length > 0);

  const paths: Record<string, string> = {};

  for (const seg of segments) {
    const audio = await generateSpeech(seg.text, config);
    const filePath = path.join(outputDir, seg.filename);
    await fs.writeFile(filePath, audio);
    paths[seg.key] = filePath;
  }

  // Generate full continuous take (sounds more natural than concatenating segments)
  const fullText = [script.hook, script.body, script.cta].filter(Boolean).join('. ');
  const fullAudio = await generateSpeech(fullText, config);
  const fullPath = path.join(outputDir, `${variant}_full.mp3`);
  await fs.writeFile(fullPath, fullAudio);

  return {
    hookAudio: paths.hook,
    bodyAudio: paths.body,
    ctaAudio: paths.cta,
    fullAudio: fullPath,
  };
}
