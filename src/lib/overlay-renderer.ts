/**
 * Renders text overlays (including emoji) to PNG images using @napi-rs/canvas.
 * FFmpeg's drawtext doesn't support emoji, so we render to PNG and overlay instead.
 *
 * EMOJI STRATEGY: @napi-rs/canvas (Skia) cannot render color emoji from Apple's SBIX
 * font format. Instead, we render text with monochrome glyphs, then overlay color emoji
 * PNGs fetched from Twemoji CDN on top of the monochrome placeholders.
 */
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
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
const PREVIEW_WIDTH = 320;
const PREVIEW_FONT_SCALE = 0.5;
const PREVIEW_GEOM_SCALE = 0.6;
const PREVIEW_LINE_HEIGHT = 1.5;
const PREVIEW_WRAPPER_PAD = 12;

/**
 * Dynamic gap between overlay boxes — MUST match VideoPreview.tsx logic exactly.
 */
export function getGapEm(overlayCount: number): number {
  if (overlayCount >= 5) return 0.3;
  if (overlayCount >= 4) return 0.5;
  return 0.9;
}

let emojiFontRegistered = false;
let emojiFontWarned = false;

function registerEmojiFont(): void {
  if (emojiFontRegistered) return;

  for (const fontPath of EMOJI_FONT_PATHS) {
    if (fs.existsSync(fontPath)) {
      try {
        GlobalFonts.registerFromPath(fontPath, 'Emoji');
        emojiFontRegistered = true;
        console.log(`[overlay-renderer] Registered emoji font: ${fontPath}`);
        return;
      } catch {
        // Try next font
      }
    }
  }

  try {
    const fcOutput = execSync('fc-list :family="Noto Color Emoji" file', {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    if (fcOutput) {
      const fontPath = fcOutput.split(':')[0].trim();
      if (fontPath && fs.existsSync(fontPath)) {
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
    console.warn('[overlay-renderer] No emoji font found — emoji will use Twemoji images only.');
    emojiFontWarned = true;
  }
}

// ── Twemoji color emoji image support ──

const TWEMOJI_CDN = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72';
const emojiImageCache = new Map<string, Awaited<ReturnType<typeof loadImage>> | null>();

/**
 * Extract leading emoji from text string.
 * Uses Intl.Segmenter to correctly handle compound emoji (ZWJ, flags, skin tones).
 */
function extractLeadingEmoji(text: string): { emoji: string; rest: string } | null {
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  const first = segmenter.segment(text)[Symbol.iterator]().next();
  if (!first.value) return null;
  const candidate = first.value.segment;
  if (/\p{Extended_Pictographic}/u.test(candidate)) {
    return { emoji: candidate, rest: text.slice(candidate.length).trimStart() };
  }
  return null;
}

function emojiToCodepoints(emoji: string, keepFE0F = false): string {
  const cps: string[] = [];
  for (const char of emoji) {
    const cp = char.codePointAt(0);
    if (cp === undefined) continue;
    if (cp === 0xfe0e) continue;
    if (!keepFE0F && cp === 0xfe0f) continue;
    cps.push(cp.toString(16));
  }
  return cps.join('-');
}

async function fetchEmojiImage(emoji: string, retries = 2): Promise<Awaited<ReturnType<typeof loadImage>> | null> {
  // Twemoji naming: some emoji include FE0F, some don't. Try both.
  const keys = [emojiToCodepoints(emoji, false), emojiToCodepoints(emoji, true)];

  for (const key of keys) {
    if (!key) continue;
    if (emojiImageCache.has(key)) {
      const cached = emojiImageCache.get(key);
      if (cached) return cached;
      continue;
    }

    // Disk cache
    const cacheDir = path.join(process.cwd(), '.cache', 'twemoji');
    const cachePath = path.join(cacheDir, `${key}.png`);
    try {
      if (fs.existsSync(cachePath)) {
        const img = await loadImage(cachePath);
        emojiImageCache.set(key, img);
        return img;
      }
    } catch (e) {
      console.warn(`[overlay-renderer] Failed to load cached emoji ${key}:`, e);
      try { fs.unlinkSync(cachePath); } catch { /* ignore */ }
    }

    // CDN fetch with retries
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const url = `${TWEMOJI_CDN}/${key}.png`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) {
          emojiImageCache.set(key, null);
          break; // 404 = emoji doesn't exist on CDN, no point retrying
        }
        const buf = Buffer.from(await res.arrayBuffer());
        // Try to cache to disk (non-critical)
        try {
          fs.mkdirSync(cacheDir, { recursive: true });
          fs.writeFileSync(cachePath, buf);
        } catch { /* ignore disk cache failure */ }
        const img = await loadImage(buf);
        emojiImageCache.set(key, img);
        console.log(`[overlay-renderer] Cached Twemoji: ${key}.png`);
        return img;
      } catch (e) {
        if (attempt < retries) {
          console.warn(`[overlay-renderer] Twemoji fetch attempt ${attempt + 1} failed for ${key}, retrying...`);
          await new Promise(r => setTimeout(r, 500 * (attempt + 1))); // backoff
        } else {
          console.warn(`[overlay-renderer] Twemoji CDN fetch failed for ${key} after ${retries + 1} attempts:`, e);
          emojiImageCache.set(key, null);
        }
      }
    }
  }
  return null;
}

/**
 * Pre-fetch all emoji images needed for a set of overlays.
 * Call this BEFORE rendering to ensure all Twemoji PNGs are cached.
 * Fetches unique emoji in parallel with retries.
 */
export async function prefetchEmojiImages(overlays: TextOverlay[]): Promise<void> {
  const uniqueEmoji = new Map<string, string>(); // emoji char → raw text (for logging)

  for (const overlay of overlays) {
    const rawText = normalizeText(overlay.emoji ? `${overlay.emoji} ${overlay.text}` : overlay.text);
    try {
      const extracted = extractLeadingEmoji(rawText);
      if (extracted && !uniqueEmoji.has(extracted.emoji)) {
        uniqueEmoji.set(extracted.emoji, rawText.slice(0, 30));
      }
    } catch { /* ignore detection failures */ }
  }

  if (uniqueEmoji.size === 0) return;

  console.log(`[overlay-renderer] Pre-fetching ${uniqueEmoji.size} unique emoji images...`);

  // Fetch all unique emoji in parallel
  const results = await Promise.allSettled(
    Array.from(uniqueEmoji.entries()).map(async ([emoji, sample]) => {
      const img = await fetchEmojiImage(emoji, 3); // extra retries for pre-fetch
      return { emoji, sample, success: img !== null };
    })
  );

  const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const failed = results.length - succeeded;
  console.log(`[overlay-renderer] Pre-fetch complete: ${succeeded}/${results.length} emoji loaded${failed > 0 ? ` (${failed} failed)` : ''}`);
}

// ── Text helpers ──

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[\u200B\u200C\uFEFF]/g, '')      // Keep ZWJ (U+200D) for emoji sequences
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .split('\n').map(l => l.trim()).join('\n');
}

function buildFont(fontSize: number, fontWeight: string): string {
  const weight = fontWeight === 'extrabold' ? '800' : fontWeight === 'bold' ? '700' : '400';
  // Font stack must match globals.css: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
  // macOS:  "Helvetica Neue" ≈ SF Pro (the system font via -apple-system)
  // Windows: "Segoe UI" (matches CSS)
  // Linux/Docker: "DejaVu Sans" (fonts-dejavu-core package)
  return `${weight} ${fontSize}px "Helvetica Neue", "Segoe UI", "DejaVu Sans", Arial, sans-serif`;
}

// ── Main render function ──

export interface OverlayRenderResult {
  path: string;
  width: number;
  height: number;
}

export async function renderOverlayToPng(
  overlay: TextOverlay,
  videoWidth: number,
  videoHeight: number,
  outputPath: string
): Promise<OverlayRenderResult> {
  registerEmojiFont();

  const { text, emoji, style } = overlay;
  const rawText = normalizeText(emoji ? `${emoji} ${text}` : text);

  // Detect leading emoji and try to fetch color Twemoji image.
  // Wrapped in try/catch so any failure falls back to text-only rendering.
  let emojiImg: Awaited<ReturnType<typeof loadImage>> | null = null;
  let textAfterEmoji: string | null = null;
  try {
    const extracted = extractLeadingEmoji(rawText);
    if (extracted) {
      textAfterEmoji = extracted.rest;
      emojiImg = await fetchEmojiImage(extracted.emoji);
    }
  } catch (e) {
    console.warn('[overlay-renderer] Emoji handling failed, falling back to text-only:', e);
    emojiImg = null;
    textAfterEmoji = null;
  }

  const scale = videoWidth / PREVIEW_WIDTH;
  const fontSize = Math.round(style.fontSize * PREVIEW_FONT_SCALE * scale);
  const padX = Math.round(style.paddingX * PREVIEW_GEOM_SCALE * scale);
  const padY = Math.round(style.paddingY * PREVIEW_GEOM_SCALE * scale);
  const borderRadius = Math.round(style.borderRadius * PREVIEW_GEOM_SCALE * scale);
  const wrapperPad = Math.round(PREVIEW_WRAPPER_PAD * scale);
  const maxBoxWidth = Math.round((videoWidth * style.maxWidth) / 100) - wrapperPad * 2;
  const lineHeight = fontSize * PREVIEW_LINE_HEIGHT;
  const textAreaWidth = maxBoxWidth - padX * 2;

  const font = buildFont(fontSize, style.fontWeight);

  // Emoji image sizing
  const emojiSize = Math.round(fontSize * 1.2);
  const emojiGap = Math.round(fontSize * 0.25);
  const emojiReserved = emojiImg ? emojiSize + emojiGap : 0;

  // If we have a Twemoji image, wrap only the remaining text (no emoji character).
  // First line is narrower to make room for the emoji image.
  // If emoji fetch failed, fall back to full rawText (emoji renders as monochrome glyph).
  const textToWrap = (emojiImg && textAfterEmoji !== null) ? textAfterEmoji : rawText;

  // Measure and wrap
  const measureCanvas = createCanvas(maxBoxWidth, 1);
  const measureCtx = measureCanvas.getContext('2d');
  measureCtx.font = font;

  // Wrap with first-line indent for emoji
  const firstLineMax = emojiImg ? textAreaWidth - emojiReserved : textAreaWidth;
  const lines = wrapTextWithIndent(measureCtx, textToWrap, textAreaWidth, firstLineMax);

  // Find widest line for fit-content box sizing
  let maxLineWidth = 0;
  for (let i = 0; i < lines.length; i++) {
    let w = measureCtx.measureText(lines[i]).width;
    if (i === 0 && emojiImg) w += emojiReserved;
    if (w > maxLineWidth) maxLineWidth = w;
  }
  const boxWidth = Math.min(Math.ceil(maxLineWidth) + padX * 2, maxBoxWidth);
  const boxHeight = Math.round(lines.length * lineHeight + padY * 2);

  console.log(`[overlay] "${rawText.slice(0, 50)}${rawText.length > 50 ? '...' : ''}" → ${lines.length} lines, box ${boxWidth}×${boxHeight}, emoji: ${emojiImg ? 'twemoji' : textAfterEmoji !== null ? 'monochrome' : 'none'}`);

  const canvas = createCanvas(boxWidth, boxHeight);
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  ctx.textBaseline = 'top';

  ctx.clearRect(0, 0, boxWidth, boxHeight);

  // Draw rounded rect background
  ctx.fillStyle =
    style.bgColor + Math.round(style.bgOpacity * 255).toString(16).padStart(2, '0');
  ctx.roundRect(0, 0, boxWidth, boxHeight, borderRadius);
  ctx.fill();

  // Draw text
  ctx.fillStyle = style.textColor;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineW = ctx.measureText(line).width;
    const fullLineW = (i === 0 && emojiImg) ? lineW + emojiReserved : lineW;

    // Calculate X based on alignment
    let lineStartX: number;
    if (style.textAlign === 'center') {
      lineStartX = (boxWidth - fullLineW) / 2;
    } else if (style.textAlign === 'right') {
      lineStartX = boxWidth - padX - fullLineW;
    } else {
      lineStartX = padX;
    }

    const textStartX = (i === 0 && emojiImg) ? lineStartX + emojiReserved : lineStartX;
    ctx.textAlign = 'left';
    ctx.fillText(line, textStartX, padY + i * lineHeight);

    // Draw color emoji image on first line
    if (i === 0 && emojiImg) {
      try {
        const emojiY = padY + (lineHeight - emojiSize) / 2;
        ctx.drawImage(emojiImg, lineStartX, emojiY, emojiSize, emojiSize);
      } catch (e) {
        console.warn('[overlay-renderer] Failed to draw emoji image:', e);
      }
    }
  }

  // If no Twemoji image was available but there IS an emoji in the text,
  // it will render with the monochrome fallback glyph (better than nothing)

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

  return { path: outputPath, width: boxWidth, height: boxHeight };
}

/**
 * Wrap text with a different max width for the first line (to leave room for emoji).
 */
function wrapTextWithIndent(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  text: string,
  maxWidth: number,
  firstLineMaxWidth: number
): string[] {
  const paragraphs = text.split('\n');
  const wrapped: string[] = [];
  let isFirstLine = true;

  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) {
      wrapped.push('');
      isFirstLine = false;
      continue;
    }
    let line = '';
    for (const word of words) {
      const limit = isFirstLine && wrapped.length === 0 ? firstLineMaxWidth : maxWidth;
      const test = line ? `${line} ${word}` : word;
      const m = ctx.measureText(test);
      if (m.width > limit && line) {
        wrapped.push(line);
        isFirstLine = false;
        line = word;
      } else if (m.width > limit && !line) {
        let chunk = '';
        for (const ch of word) {
          const t = chunk + ch;
          if (ctx.measureText(t).width > limit && chunk) {
            wrapped.push(chunk);
            isFirstLine = false;
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
    if (line) {
      wrapped.push(line);
      isFirstLine = false;
    }
  }
  return wrapped.length ? wrapped : [''];
}

// ── Gap calculation for FFmpeg stacking ──

/**
 * Get the gap in pixels between overlays for a given overlay set.
 */
export function getGapPx(overlayCount: number, fontSize: number, videoWidth: number): number {
  const scale = videoWidth / PREVIEW_WIDTH;
  const gapEm = getGapEm(overlayCount);
  return Math.round(fontSize * PREVIEW_FONT_SCALE * gapEm * scale);
}
