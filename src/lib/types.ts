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
}

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
