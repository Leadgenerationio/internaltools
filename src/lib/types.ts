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

export interface VideoProject {
  id: string;
  videos: UploadedVideo[];
  overlays: TextOverlay[];
  music: MusicTrack | null;
  outputFormat: '9:16' | '1:1' | '16:9';
  videoDuration: number;  // seconds (auto-detected from first video)
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
}

export interface RenderJob {
  id: string;
  status: 'queued' | 'processing' | 'complete' | 'error';
  progress: number;      // 0-100
  videoId: string;
  outputPath: string | null;
  error: string | null;
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

// Preset templates
export const OVERLAY_PRESETS = {
  'white-box': {
    name: 'White Box (like your ad)',
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
