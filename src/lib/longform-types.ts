/**
 * Types for the Longform Video ad creation pipeline.
 *
 * Pipeline: Brief → Scripts (Claude) → Voiceover (ElevenLabs)
 *         → B-Roll (kie.ai) → Stitch (FFmpeg) → Edit Scenes → Finalize + Caption (Submagic)
 */

// ─── Script Structure ────────────────────────────────────────────────────────

export interface LongformScript {
  variant: string;       // e.g. "pain-point", "social-proof", "urgency"
  hook: string;          // 2-5 seconds spoken
  body: string;          // 15-25 seconds spoken
  cta: string;           // 3-5 seconds spoken
  suggestedBroll: string[]; // scene descriptions for AI b-roll
}

// ─── Brief ───────────────────────────────────────────────────────────────────

export interface LongformBrief {
  productService: string;
  targetAudience: string;
  offer: string;
  keyBenefits: string;
  cta: string;
  tone: string;
  language: string;
  numVariants: number;     // 1-4
}

// ─── Voiceover Configuration ─────────────────────────────────────────────────

export interface VoiceoverConfig {
  voiceId: string;
  model: string;           // e.g. "eleven_multilingual_v2"
  stability: number;       // 0-1
  similarityBoost: number; // 0-1
  style: number;           // 0-1
  speed: number;           // 0.5-2.0
}

export const DEFAULT_VOICE_CONFIG: VoiceoverConfig = {
  voiceId: 'JBFqnCBsd6RMkjVDRZzb', // ElevenLabs default
  model: 'eleven_multilingual_v2',
  stability: 0.5,
  similarityBoost: 0.75,
  style: 0.0,
  speed: 1.0,
};

// ─── Caption Configuration ───────────────────────────────────────────────────

export interface CaptionConfig {
  enabled: boolean;
  template: string;        // e.g. "Hormozi 2" — Submagic template name
  language: string;        // e.g. "en"
  magicZooms: boolean;
  cleanAudio: boolean;
}

export const DEFAULT_CAPTION_CONFIG: CaptionConfig = {
  enabled: true,
  template: 'Hormozi 2',
  language: 'en',
  magicZooms: true,
  cleanAudio: false,
};

// ─── Scene (individual b-roll clip) ─────────────────────────────────────────

export interface LongformScene {
  order: number;
  prompt: string;
  clipUrl: string;         // URL to the individual clip (via fileUrl)
  clipFilename: string;    // filename in outputs/
  durationSeconds: number;
}

// ─── Pipeline Options ────────────────────────────────────────────────────────

export interface LongformOptions {
  voiceConfig: VoiceoverConfig;
  captionConfig: CaptionConfig;
  skipBroll: boolean;
  videoModel?: string;       // kie.ai model ID for b-roll generation
  hookClipPath?: string;     // optional pre-filmed hook video
}

// ─── Pipeline Progress ──────────────────────────────────────────────────────

export type LongformStage = 'voiceover' | 'broll' | 'stitch' | 'caption' | 'done';

export interface LongformProgress {
  stage: LongformStage;
  variantIndex: number;
  totalVariants: number;
  stageProgress: number; // 0-100 within the current stage
  message: string;
}

// ─── Result ──────────────────────────────────────────────────────────────────

export interface LongformResultItem {
  variant: string;
  videoUrl: string;
  captioned: boolean;
  durationSeconds: number;
  voiceoverUrl?: string;       // URL to voiceover audio (for reassembly)
  scenes?: LongformScene[];    // individual scene clips (for editor)
  scriptText?: string;         // full script text (for re-captioning)
}
