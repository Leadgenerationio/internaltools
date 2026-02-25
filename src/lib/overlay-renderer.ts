/**
 * Renders text overlays (including emoji) to PNG images using @napi-rs/canvas.
 * FFmpeg's drawtext doesn't support emoji, so we render to PNG and overlay instead.
 */
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import path from 'path';
import fs from 'fs';
import type { TextOverlay } from './types';

const EMOJI_FONT_PATHS = [
  '/System/Library/Fonts/Apple Color Emoji.ttc', // macOS
  '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf', // Linux
  'C:\\Windows\\Fonts\\seguiemj.ttf', // Windows Segoe UI Emoji
];

// ── Preview-matching scale constants ──
// These MUST stay in sync with VideoPreview.tsx CSS multipliers.
// Preview renders at PREVIEW_WIDTH (320px); renderer outputs at videoWidth (1080px).
// Render scale = videoWidth / PREVIEW_WIDTH so proportions match exactly.
const PREVIEW_WIDTH = 320;
const PREVIEW_FONT_SCALE = 0.5;   // fontSize * 0.5 in preview CSS
const PREVIEW_GEOM_SCALE = 0.6;   // paddingX/Y/borderRadius * 0.6 in preview CSS
const PREVIEW_LINE_HEIGHT = 1.5;  // Tailwind default line-height
const PREVIEW_GAP_EM = 0.9;       // marginBottom: 0.9em in preview CSS
const PREVIEW_WRAPPER_PAD = 12;   // px-3 (0.75rem) side padding on overlay wrapper in preview CSS
let emojiFontRegistered = false;
let emojiFontWarned = false;

function registerEmojiFont(): void {
  if (emojiFontRegistered) return;
  for (const fontPath of EMOJI_FONT_PATHS) {
    if (fs.existsSync(fontPath)) {
      try {
        GlobalFonts.registerFromPath(fontPath, 'Emoji');
        emojiFontRegistered = true;
        return;
      } catch {
        // Try next font
      }
    }
  }
  if (!emojiFontWarned) {
    console.warn('[overlay-renderer] No emoji font found — emoji characters will render as boxes. Checked:', EMOJI_FONT_PATHS.join(', '));
    emojiFontWarned = true;
  }
}

/**
 * Normalize text before measuring/rendering — strips invisible chars that
 * cause phantom gaps between words or mismatched wrapping vs. CSS preview.
 */
function normalizeText(text: string): string {
  return text
    .replace(/\r/g, '')                        // Remove carriage returns (\r\n → \n)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')     // Remove zero-width chars (ZWS, ZWNJ, ZWJ, BOM)
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
  return `${weight} ${fontSize}px Arial, Emoji, sans-serif`;
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
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const pngBuffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, pngBuffer);

  return outputPath;
}

/**
 * Get the height of a rendered overlay (for stacking) — uses shared wrap logic
 */
export function getOverlayHeight(overlay: TextOverlay, videoWidth: number): number {
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
  // Gap matches preview's marginBottom: 0.9em (em = fontSize in preview CSS)
  const gap = Math.round(style.fontSize * PREVIEW_FONT_SCALE * PREVIEW_GAP_EM * scale);
  return lines.length * lineHeight + padY * 2 + gap;
}
