/**
 * Renders text overlays (including emoji) to PNG images using @napi-rs/canvas.
 * FFmpeg's drawtext doesn't support emoji, so we render to PNG and overlay instead.
 */
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import type { TextOverlay } from './types';

const EMOJI_FONT_PATHS = [
  '/System/Library/Fonts/Apple Color Emoji.ttc',                       // macOS
  '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf',                 // Debian 11 / Ubuntu 20.04+
  '/usr/share/fonts/truetype/noto-color-emoji/NotoColorEmoji.ttf',     // Debian 12 Bookworm
  '/usr/share/fonts/noto-color-emoji/NotoColorEmoji.ttf',              // Some distros
  '/usr/share/fonts/google-noto-emoji/NotoColorEmoji.ttf',             // Fedora/RHEL
  '/usr/local/share/fonts/NotoColorEmoji.ttf',                         // Manual install
  'C:\\Windows\\Fonts\\seguiemj.ttf',                                  // Windows
];

// ── Preview-matching scale constants ──
// These MUST stay in sync with VideoPreview.tsx CSS multipliers.
// Preview renders at PREVIEW_WIDTH (320px); renderer outputs at videoWidth (1080px).
// Render scale = videoWidth / PREVIEW_WIDTH so proportions match exactly.
const PREVIEW_WIDTH = 320;
const PREVIEW_FONT_SCALE = 0.5;   // fontSize * 0.5 in preview CSS
const PREVIEW_GEOM_SCALE = 0.6;   // paddingX/Y/borderRadius * 0.6 in preview CSS
const PREVIEW_LINE_HEIGHT = 1.5;  // Tailwind default line-height
const PREVIEW_WRAPPER_PAD = 12;   // px-3 (0.75rem) side padding on overlay wrapper in preview CSS

/**
 * Dynamic gap between overlay boxes — MUST match VideoPreview.tsx logic exactly.
 * More overlays → tighter spacing so everything fits in the safe zone.
 */
export function getGapEm(overlayCount: number): number {
  if (overlayCount >= 5) return 0.3;
  if (overlayCount >= 4) return 0.5;
  return 0.9;
}
let emojiFontRegistered = false;
let emojiFontWarned = false;

/** Map of font file paths → the native family name to register with */
const EMOJI_FONT_FAMILIES: Record<string, string> = {
  '/System/Library/Fonts/Apple Color Emoji.ttc': 'Apple Color Emoji',
  'C:\\Windows\\Fonts\\seguiemj.ttf': 'Segoe UI Emoji',
};

function registerEmojiFont(): void {
  if (emojiFontRegistered) return;

  // Try static paths first (fastest).
  // Register under BOTH the native family name and the generic "Emoji" alias
  // so the font string fallback chain works regardless of platform.
  for (const fontPath of EMOJI_FONT_PATHS) {
    if (fs.existsSync(fontPath)) {
      try {
        const nativeName = EMOJI_FONT_FAMILIES[fontPath];
        if (nativeName) {
          GlobalFonts.registerFromPath(fontPath, nativeName);
        }
        GlobalFonts.registerFromPath(fontPath, 'Emoji');
        // Also register as Noto Color Emoji for Linux paths
        if (fontPath.includes('Noto')) {
          GlobalFonts.registerFromPath(fontPath, 'Noto Color Emoji');
        }
        emojiFontRegistered = true;
        console.log(`[overlay-renderer] Registered emoji font: ${fontPath}${nativeName ? ` (as "${nativeName}" + "Emoji")` : ''}`);
        return;
      } catch {
        // Try next font
      }
    }
  }

  // Fallback: discover emoji font via fc-list (works on any Linux with fontconfig)
  try {
    const fcOutput = execSync('fc-list :family="Noto Color Emoji" file', {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    if (fcOutput) {
      const fontPath = fcOutput.split(':')[0].trim();
      if (fontPath && fs.existsSync(fontPath)) {
        GlobalFonts.registerFromPath(fontPath, 'Noto Color Emoji');
        GlobalFonts.registerFromPath(fontPath, 'Emoji');
        emojiFontRegistered = true;
        console.log(`[overlay-renderer] Registered emoji font via fc-list: ${fontPath}`);
        return;
      }
    }
  } catch {
    // fc-list not available or failed
  }

  if (!emojiFontWarned) {
    console.warn('[overlay-renderer] No emoji font found — emoji characters will render as boxes. Checked:', EMOJI_FONT_PATHS.join(', '));
    emojiFontWarned = true;
  }
}

/**
 * Normalize text before measuring/rendering — strips invisible chars that
 * cause phantom gaps between words or mismatched wrapping vs. CSS preview.
 *
 * IMPORTANT: Preserve U+200D (ZWJ) as many emoji sequences depend on it
 * (e.g. 👨‍👩‍👧 = 👨 + ZWJ + 👩 + ZWJ + 👧). Stripping ZWJ corrupts emojis.
 */
function normalizeText(text: string): string {
  return text
    .replace(/\r/g, '')                        // Remove carriage returns (\r\n → \n)
    .replace(/[\u200B\u200C\uFEFF]/g, '')      // Remove ZWS, ZWNJ, BOM — but KEEP ZWJ (U+200D)
    .replace(/\u00A0/g, ' ')                    // Non-breaking space → regular space
    .replace(/[ \t]+/g, ' ')                    // Collapse runs of horizontal whitespace
    .split('\n').map(l => l.trim()).join('\n');  // Trim each line
}

/**
 * Shared text wrapping logic — used by both renderOverlayToPng and getOverlayHeight
 */
function wrapText(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split('\n');
  const wrapped: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) {
      wrapped.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      const m = ctx.measureText(test);
      if (m.width > maxWidth && line) {
        wrapped.push(line);
        line = word;
      } else if (m.width > maxWidth && !line) {
        let chunk = '';
        for (const ch of word) {
          const t = chunk + ch;
          if (ctx.measureText(t).width > maxWidth && chunk) {
            wrapped.push(chunk);
            chunk = ch;
          } else {
            chunk = t;
          }
        }
        line = chunk;
      } else {
        line = test;
      }
    }
    if (line) wrapped.push(line);
  }
  return wrapped.length ? wrapped : [''];
}

function buildFont(fontSize: number, fontWeight: string): string {
  const weight = fontWeight === 'extrabold' ? '800' : fontWeight === 'bold' ? '700' : '400';
  // DejaVu Sans is installed in Docker (fonts-dejavu-core); Arial is macOS/Windows only.
  // Emoji fonts MUST be listed explicitly by their platform family names so @napi-rs/canvas
  // (Skia) falls through to them for emoji codepoints instead of rendering wrong glyphs.
  return `${weight} ${fontSize}px "DejaVu Sans", Arial, "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Emoji", Emoji, sans-serif`;
}

/**
 * Render a single text overlay to PNG with proper emoji support
 */
export async function renderOverlayToPng(
  overlay: TextOverlay,
  videoWidth: number,
  videoHeight: number,
  outputPath: string
): Promise<string> {
  registerEmojiFont();

  const { text, emoji, style } = overlay;
  const displayText = normalizeText(emoji ? `${emoji} ${text}` : text);

  // Scale factor: maps preview CSS pixels (320px container) to render pixels (1080px output)
  const scale = videoWidth / PREVIEW_WIDTH;
  const fontSize = Math.round(style.fontSize * PREVIEW_FONT_SCALE * scale);
  const padX = Math.round(style.paddingX * PREVIEW_GEOM_SCALE * scale);
  const padY = Math.round(style.paddingY * PREVIEW_GEOM_SCALE * scale);
  const borderRadius = Math.round(style.borderRadius * PREVIEW_GEOM_SCALE * scale);

  // Account for the px-3 wrapper padding in VideoPreview.tsx (12px each side at preview scale)
  const wrapperPad = Math.round(PREVIEW_WRAPPER_PAD * scale);
  const maxBoxWidth = Math.round((videoWidth * style.maxWidth) / 100) - wrapperPad * 2;
  const lineHeight = fontSize * PREVIEW_LINE_HEIGHT;
  const textAreaWidth = maxBoxWidth - padX * 2;

  const font = buildFont(fontSize, style.fontWeight);

  // Measure text to determine fit-content width (not always maxBoxWidth)
  const measureCanvas = createCanvas(maxBoxWidth, 1);
  const measureCtx = measureCanvas.getContext('2d');
  measureCtx.font = font;

  const lines = wrapText(measureCtx, displayText, textAreaWidth);

  // Find widest line for fit-content box sizing
  let maxLineWidth = 0;
  for (const line of lines) {
    const w = measureCtx.measureText(line).width;
    if (w > maxLineWidth) maxLineWidth = w;
  }
  const boxWidth = Math.min(Math.ceil(maxLineWidth) + padX * 2, maxBoxWidth);
  const boxHeight = Math.round(lines.length * lineHeight + padY * 2);

  console.log(`[overlay] "${displayText.slice(0, 50)}${displayText.length > 50 ? '...' : ''}" → ${lines.length} lines, box ${boxWidth}×${boxHeight}, textArea ${textAreaWidth}px`);
  if (lines.length > 1) {
    lines.forEach((l, i) => console.log(`  line ${i}: "${l}"`));
  }

  const canvas = createCanvas(boxWidth, boxHeight);
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  ctx.textAlign = style.textAlign;
  ctx.textBaseline = 'top';

  ctx.clearRect(0, 0, boxWidth, boxHeight);

  // Draw rounded rect background
  ctx.fillStyle =
    style.bgColor + Math.round(style.bgOpacity * 255).toString(16).padStart(2, '0');
  ctx.roundRect(0, 0, boxWidth, boxHeight, borderRadius);
  ctx.fill();

  // Draw text — centered within the fit-content box
  ctx.fillStyle = style.textColor;
  const textX =
    style.textAlign === 'center'
      ? boxWidth / 2
      : style.textAlign === 'right'
        ? boxWidth - padX
        : padX;

  lines.forEach((line, i) => {
    ctx.fillText(line, textX, padY + i * lineHeight);
  });

  const dir = path.dirname(outputPath);
  const publicDir = path.resolve(path.join(process.cwd(), 'public'));
  if (!path.resolve(outputPath).startsWith(publicDir)) {
    throw new Error('Overlay output path must be within the public directory');
  }
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const pngBuffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, pngBuffer);

  return outputPath;
}

/**
 * Get the height of a rendered overlay (for stacking) — uses shared wrap logic.
 * @param totalOverlays — total number of overlays in the set, used for dynamic gap sizing
 */
export function getOverlayHeight(overlay: TextOverlay, videoWidth: number, totalOverlays: number): number {
  const { text, emoji, style } = overlay;
  const displayText = normalizeText(emoji ? `${emoji} ${text}` : text);
  const scale = videoWidth / PREVIEW_WIDTH;
  const fontSize = Math.round(style.fontSize * PREVIEW_FONT_SCALE * scale);
  const padY = Math.round(style.paddingY * PREVIEW_GEOM_SCALE * scale);
  const lineHeight = fontSize * PREVIEW_LINE_HEIGHT;
  const wrapperPad = Math.round(PREVIEW_WRAPPER_PAD * scale);
  const maxBoxWidth = Math.round((videoWidth * style.maxWidth) / 100) - wrapperPad * 2;
  const padX = Math.round(style.paddingX * PREVIEW_GEOM_SCALE * scale);
  const textAreaWidth = maxBoxWidth - padX * 2;

  const font = buildFont(fontSize, style.fontWeight);
  const canvas = createCanvas(1, 1);
  const ctx = canvas.getContext('2d');
  ctx.font = font;

  const lines = wrapText(ctx, displayText, textAreaWidth);
  // Dynamic gap matches VideoPreview.tsx: fewer overlays → more space between boxes
  const gapEm = getGapEm(totalOverlays);
  const gap = Math.round(style.fontSize * PREVIEW_FONT_SCALE * gapEm * scale);
  return lines.length * lineHeight + padY * 2 + gap;
}
