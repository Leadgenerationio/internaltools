/**
 * Renders text overlays (including emoji) to PNG images using @napi-rs/canvas.
 * FFmpeg's drawtext doesn't support emoji, so we render to PNG and overlay instead.
 */
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import path from 'path';
import fs from 'fs';
import type { TextOverlay, TextStyle } from './types';

const EMOJI_FONT_PATHS = [
  '/System/Library/Fonts/Apple Color Emoji.ttc', // macOS
  '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf', // Linux
  'C:\\Windows\\Fonts\\seguiemj.ttf', // Windows Segoe UI Emoji
];

let emojiFontRegistered = false;

function registerEmojiFont(): void {
  if (emojiFontRegistered) return;
  for (const fontPath of EMOJI_FONT_PATHS) {
    if (fs.existsSync(fontPath)) {
      try {
        GlobalFonts.registerFromPath(fontPath, 'Emoji');
        emojiFontRegistered = true;
        break;
      } catch {
        // Try next font
      }
    }
  }
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
  const displayText = emoji ? `${emoji} ${text}` : text;

  const scale = videoWidth / 360;
  const fontSize = Math.round(style.fontSize * scale);
  const padX = Math.round(style.paddingX * scale);
  const padY = Math.round(style.paddingY * scale);
  const borderRadius = Math.round(style.borderRadius * scale);

  const fontWeight =
    style.fontWeight === 'extrabold' ? '800' : style.fontWeight === 'bold' ? '700' : '400';

  const maxBoxWidth = Math.round((videoWidth * style.maxWidth) / 100);
  const lineHeight = fontSize * 1.4;
  const textAreaWidth = maxBoxWidth - padX * 2;

  const canvas = createCanvas(maxBoxWidth, 1);
  const ctx = canvas.getContext('2d');
  ctx.font = `${fontWeight} ${fontSize}px Emoji, Arial, sans-serif`;

  // Word-wrap text to fit width (matches preview behavior)
  function wrapText(str: string): string[] {
    const paragraphs = str.split('\n');
    const wrapped: string[] = [];
    for (const para of paragraphs) {
      const words = para.split(/\s+/);
      let line = '';
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        const m = ctx.measureText(test);
        if (m.width > textAreaWidth && line) {
          wrapped.push(line);
          line = word;
        } else if (m.width > textAreaWidth && !line) {
          // Single word longer than width - wrap by character
          let chunk = '';
          for (const ch of word) {
            const t = chunk + ch;
            if (ctx.measureText(t).width > textAreaWidth && chunk) {
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

  const lines = wrapText(displayText);
  const boxHeight = lines.length * lineHeight + padY * 2;

  canvas.width = maxBoxWidth;
  canvas.height = boxHeight;
  ctx.font = `${fontWeight} ${fontSize}px Emoji, Arial, sans-serif`;
  ctx.textAlign = style.textAlign;
  ctx.textBaseline = 'top';

  // Transparent background
  ctx.clearRect(0, 0, maxBoxWidth, boxHeight);

  // Draw rounded rect background
  ctx.fillStyle =
    style.bgColor + Math.round(style.bgOpacity * 255).toString(16).padStart(2, '0');
  ctx.roundRect(0, 0, maxBoxWidth, boxHeight, borderRadius);
  ctx.fill();

  // Draw text - use proper x based on textAlign
  ctx.fillStyle = style.textColor;
  const textX =
    style.textAlign === 'center'
      ? maxBoxWidth / 2
      : style.textAlign === 'right'
        ? maxBoxWidth - padX
        : padX;

  lines.forEach((line, i) => {
    ctx.fillText(line, textX, padY + i * lineHeight, textAreaWidth);
  });

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const pngBuffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, pngBuffer);

  return outputPath;
}

/**
 * Get the height of a rendered overlay (for stacking) - uses same wrap logic as render
 */
export function getOverlayHeight(overlay: TextOverlay, videoWidth: number): number {
  const { text, emoji, style } = overlay;
  const displayText = emoji ? `${emoji} ${text}` : text;
  const scale = videoWidth / 360;
  const fontSize = Math.round(style.fontSize * scale);
  const padX = Math.round(style.paddingX * scale);
  const padY = Math.round(style.paddingY * scale);
  const lineHeight = fontSize * 1.4;
  const maxBoxWidth = Math.round((videoWidth * style.maxWidth) / 100);
  const textAreaWidth = maxBoxWidth - padX * 2;

  const canvas = createCanvas(1, 1);
  const ctx = canvas.getContext('2d');
  ctx.font = `${style.fontWeight === 'extrabold' ? '800' : style.fontWeight === 'bold' ? '700' : '400'} ${fontSize}px Emoji, Arial, sans-serif`;

  const paragraphs = displayText.split('\n');
  let lineCount = 0;
  for (const para of paragraphs) {
    const words = para.split(/\s+/);
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > textAreaWidth && line) {
        lineCount++;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lineCount++;
  }
  if (lineCount === 0) lineCount = 1;
  return lineCount * lineHeight + padY * 2 + 10;
}
