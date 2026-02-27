export interface TextOverlay {
  id: string;
  text: string;  // includes emojis - type or paste them directly
  emoji?: string;  // deprecated - kept for backward compat with existing overlays
  startTime: number;   // seconds from start when this text appears
  endTime: number;     // seconds when this text disappears (usually end of video)
  position: 'top' | 'center' | 'bottom'; // vertical region
  yOffset: number;     // pixel offset from position anchor
  style: TextStyle;
}

export interface TextStyle {
  fontSize: number;
  fontWeight: 'normal' | 'bold' | 'extrabold';
  textColor: string;       // hex color
  bgColor: string;         // hex color for background box
  bgOpacity: number;       // 0-1
  borderRadius: number;    // pixels
  paddingX: number;        // horizontal padding
  paddingY: number;        // vertical padding
  maxWidth: number;        // percentage of video width (0-100)
  textAlign: 'left' | 'center' | 'right';
}

export interface MusicTrack {
  id: string;
  name: string;
  file: string;          // path or URL
  volume: number;        // 0-1
  startTime: number;     // offset in the music track
  fadeIn: number;         // seconds
  fadeOut: number;        // seconds
}

export interface UploadedVideo {
  id: string;
  filename: string;
  originalName: string;
  path: string;
  duration: number;
  width: number;
  height: number;
  thumbnail: string;
  trimStart?: number;  // seconds from start to begin
  trimEnd?: number;    // seconds from start to end
}

// Default style matching the solar ad format (rounded white boxes, bold text, generous padding)
export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontSize: 28,
  fontWeight: 'bold',
  textColor: '#1a1a1a',
  bgColor: '#ffffff',
  bgOpacity: 0.9,
  borderRadius: 16,
  paddingX: 28,
  paddingY: 20,
  maxWidth: 90,
  textAlign: 'center',
};

// === Ad Funnel Generation Types ===

export interface AdBrief {
  productService: string;
  targetAudience: string;
  sellingPoints: string;
  adExamples: string;
  toneStyle: string;
  additionalContext: string;
  addEmojis: boolean;
  language: string;
}

export const AD_LANGUAGES = [
  'English',
  'Spanish',
  'French',
  'German',
  'Italian',
  'Portuguese',
  'Dutch',
  'Polish',
  'Swedish',
  'Norwegian',
  'Danish',
  'Finnish',
  'Arabic',
  'Hindi',
  'Japanese',
  'Korean',
  'Chinese (Simplified)',
  'Chinese (Traditional)',
  'Turkish',
  'Russian',
] as const;

export type FunnelStage = 'tofu' | 'mofu' | 'bofu';

export const FUNNEL_LABELS: Record<FunnelStage, string> = {
  tofu: 'Top of Funnel',
  mofu: 'Middle of Funnel',
  bofu: 'Bottom of Funnel',
};

export const FUNNEL_DESCRIPTIONS: Record<FunnelStage, string> = {
  tofu: 'Awareness — hook attention, spark curiosity',
  mofu: 'Consideration — build trust, educate, show value',
  bofu: 'Conversion — drive action, create urgency',
};

export interface GeneratedAd {
  id: string;
  funnelStage: FunnelStage;
  variationLabel: string; // e.g. "Variation 1"
  textBoxes: { id: string; text: string }[];
  approved: boolean;
}

// === AI Video Model Definitions ===

export type VideoApiType = 'veo' | 'market';

export interface VideoModel {
  id: string;
  label: string;
  priceLabel: string;
  duration: number;       // fixed output duration in seconds
  aspectRatios: string[];
  supportsSound: boolean;
  apiType: VideoApiType;  // which kie.ai endpoint pattern to use
  tokenCost: number;      // tokens per video (priced to ensure profit at all plan tiers)
}

export const VIDEO_MODELS: VideoModel[] = [
  {
    id: 'sora-2-text-to-video',
    label: 'Sora 2',
    priceLabel: '$0.15 · 3 tokens',
    duration: 10,
    aspectRatios: ['9:16', '16:9'],
    supportsSound: false,
    apiType: 'market',
    tokenCost: 3,
  },
  {
    id: 'veo3_fast',
    label: 'Veo 3.1 Fast',
    priceLabel: '$0.40 · 5 tokens',
    duration: 8,
    aspectRatios: ['9:16', '16:9'],
    supportsSound: true,
    apiType: 'veo',
    tokenCost: 5,
  },
  {
    id: 'sora-2-pro-text-to-video',
    label: 'Sora 2 Pro',
    priceLabel: '$0.40 · 5 tokens',
    duration: 10,
    aspectRatios: ['9:16', '16:9'],
    supportsSound: false,
    apiType: 'market',
    tokenCost: 5,
  },
  {
    id: 'kling-2.6/text-to-video',
    label: 'Kling 2.6',
    priceLabel: '$0.55 · 7 tokens',
    duration: 5,
    aspectRatios: ['9:16', '16:9', '1:1'],
    supportsSound: true,
    apiType: 'market',
    tokenCost: 7,
  },
  {
    id: 'veo3',
    label: 'Veo 3.1 Quality',
    priceLabel: '$2.00 · 25 tokens',
    duration: 8,
    aspectRatios: ['9:16', '16:9'],
    supportsSound: true,
    apiType: 'veo',
    tokenCost: 25,
  },
];

export const DEFAULT_VIDEO_MODEL = 'sora-2-text-to-video';

// Preset templates
export const OVERLAY_PRESETS = {
  'white-box': {
    name: 'White Box',
    style: { ...DEFAULT_TEXT_STYLE },
  },
  'dark-box': {
    name: 'Dark Box',
    style: {
      ...DEFAULT_TEXT_STYLE,
      textColor: '#ffffff',
      bgColor: '#000000',
      bgOpacity: 0.75,
    },
  },
  'gradient-box': {
    name: 'Gradient Accent',
    style: {
      ...DEFAULT_TEXT_STYLE,
      textColor: '#ffffff',
      bgColor: '#6366f1',
      bgOpacity: 0.9,
    },
  },
  'minimal': {
    name: 'Minimal (no background)',
    style: {
      ...DEFAULT_TEXT_STYLE,
      bgOpacity: 0,
      textColor: '#ffffff',
      fontWeight: 'extrabold' as const,
    },
  },
};
