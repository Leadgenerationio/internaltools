/**
 * Built-in FFmpeg captioning for the longform pipeline.
 *
 * Estimates word timing from voiceover duration, generates ASS subtitles,
 * and burns them into the video. This replaces the Submagic dependency
 * when no cloud storage (S3/CDN) is configured.
 *
 * Word-by-word highlight style: shows 3-5 words at a time with the
 * current word highlighted in a different color.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execFileAsync = promisify(execFile);

// ─── Word Timing Estimation ─────────────────────────────────────────────────

export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
}

/**
 * Estimate word-level timing from script text and audio duration.
 * Accounts for word length (longer words = more time) and punctuation pauses.
 */
export function estimateWordTimings(
  scriptText: string,
  audioDurationMs: number,
): WordTiming[] {
  const words = scriptText.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  // Weight each word by character count + punctuation pause
  const weights = words.map((w) => {
    let weight = w.replace(/[^\w]/g, '').length || 1;
    // Add pause weight for sentence-ending punctuation
    if (/[.!?]$/.test(w)) weight += 3;
    else if (/[,;:]$/.test(w)) weight += 1.5;
    return weight;
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const timings: WordTiming[] = [];
  let currentMs = 0;

  for (let i = 0; i < words.length; i++) {
    const durationMs = (weights[i] / totalWeight) * audioDurationMs;
    timings.push({
      word: words[i],
      startMs: Math.round(currentMs),
      endMs: Math.round(currentMs + durationMs),
    });
    currentMs += durationMs;
  }

  return timings;
}

// ─── ASS Subtitle Generation ────────────────────────────────────────────────

interface CaptionStyle {
  fontName: string;
  fontSize: number;
  primaryColor: string;  // ASS &HBBGGRR& format
  highlightColor: string;
  outlineColor: string;
  outlineWidth: number;
  shadowDepth: number;
  marginV: number;
}

const DEFAULT_STYLE: CaptionStyle = {
  fontName: 'Arial',
  fontSize: 52,
  primaryColor: '&H00FFFFFF',   // white
  highlightColor: '&H000055FF', // orange-yellow highlight
  outlineColor: '&H00000000',   // black outline
  outlineWidth: 3,
  shadowDepth: 1,
  marginV: 160,
};

function msToAssTime(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Generate an ASS subtitle file with word-by-word highlighting.
 * Shows 3-5 words at a time, with the currently-spoken word highlighted.
 */
export async function generateAssSubtitle(
  timings: WordTiming[],
  outputPath: string,
  style: Partial<CaptionStyle> = {},
): Promise<string> {
  const s = { ...DEFAULT_STYLE, ...style };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  // Group words into chunks of 3-5
  const CHUNK_SIZE = 4;
  const chunks: WordTiming[][] = [];
  for (let i = 0; i < timings.length; i += CHUNK_SIZE) {
    chunks.push(timings.slice(i, i + CHUNK_SIZE));
  }

  // ASS header
  const header = `[Script Info]
Title: Longform Captions
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${s.fontName},${s.fontSize},${s.primaryColor},&H000000FF,${s.outlineColor},&H80000000,1,0,0,0,100,100,0,0,1,${s.outlineWidth},${s.shadowDepth},2,40,40,${s.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Generate dialogue lines with word highlighting
  const dialogues: string[] = [];

  for (const chunk of chunks) {
    const chunkStart = chunk[0].startMs;
    const chunkEnd = chunk[chunk.length - 1].endMs;

    // For each word in the chunk, create a dialogue line where that word is highlighted
    for (let wi = 0; wi < chunk.length; wi++) {
      const wordStart = chunk[wi].startMs;
      const wordEnd = chunk[wi].endMs;

      // Build the text with the current word highlighted
      const parts = chunk.map((w, j) => {
        const cleanWord = w.word.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
        if (j === wi) {
          return `{\\c${s.highlightColor}}${cleanWord}{\\c${s.primaryColor}}`;
        }
        return cleanWord;
      });

      const text = `{\\an2}${parts.join(' ')}`;
      dialogues.push(
        `Dialogue: 0,${msToAssTime(wordStart)},${msToAssTime(wordEnd)},Default,,0,0,0,,${text}`
      );
    }
  }

  const content = header + dialogues.join('\n') + '\n';
  await fs.writeFile(outputPath, content, 'utf-8');
  return outputPath;
}

// ─── Burn Captions into Video ───────────────────────────────────────────────

/**
 * Burn ASS subtitles into a video using FFmpeg.
 */
export async function burnCaptions(
  videoPath: string,
  assPath: string,
  outputPath: string,
): Promise<string> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  // Escape special chars in ASS path for FFmpeg filter
  const escapedAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''");

  await execFileAsync('ffmpeg', [
    '-y',
    '-i', videoPath,
    '-vf', `ass='${escapedAssPath}'`,
    '-c:v', 'libx264', '-preset', 'medium',
    '-c:a', 'copy',
    outputPath,
  ]);

  return outputPath;
}

/**
 * Full captioning pipeline: estimate timing → generate ASS → burn into video.
 */
export async function addBuiltInCaptions(
  videoPath: string,
  scriptText: string,
  audioDurationMs: number,
  outputPath: string,
  tempDir: string,
): Promise<string> {
  const timings = estimateWordTimings(scriptText, audioDurationMs);
  if (timings.length === 0) return videoPath; // nothing to caption

  const assPath = path.join(tempDir, 'captions.ass');
  await generateAssSubtitle(timings, assPath);
  await burnCaptions(videoPath, assPath, outputPath);

  return outputPath;
}
