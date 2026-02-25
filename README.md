# Andromedia Ad Maker

Create scroll-stopping video ads with timed text overlays and background music. Upload multiple videos and batch-process them with the same text + music configuration.

## What it does

Replicates the popular Facebook/TikTok ad format where:
- A lifestyle/product video plays in the background (9:16 vertical)
- Text boxes with emojis appear one at a time, stacking from top to bottom
- Each text box has a semi-transparent background (white by default)
- Background music plays underneath

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Make sure FFmpeg is installed
# macOS: brew install ffmpeg
# Ubuntu: sudo apt install ffmpeg
# Windows: download from ffmpeg.org

# 3. Run the dev server
npm run dev

# 4. Open http://localhost:3000
```

## How to use

1. **Upload videos** — drag and drop one or more MP4/MOV files
2. **Add text overlays** — click "+ Add Text" to add boxes. Set the emoji, text, and timing for each
3. **Add music** (optional) — upload an MP3/WAV track, adjust volume and fade
4. **Click Render** — FFmpeg processes all videos with your overlays and music
5. **Download** — grab your finished video ads

## Batch Mode

Upload 10 different background videos. Define your text overlays once. Hit render. Get 10 finished ads — each with the same text + music over a different background video.

## Tech Stack

- Next.js 14 (App Router)
- TypeScript + Tailwind CSS
- FFmpeg (server-side rendering via fluent-ffmpeg)

## Customization

Edit `src/lib/types.ts` to modify presets:
- **White Box** — white semi-transparent background, dark text (default)
- **Dark Box** — dark background, white text
- **Gradient Accent** — purple/blue background
- **Minimal** — no background, just bold white text
