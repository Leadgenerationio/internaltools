# Architecture — Ad Maker

## Overview

A Next.js web app that generates funnel-based ad copy via AI, lets you review and edit it, then batch-renders video ads with timed text overlays and background music using server-side FFmpeg.

Built for producing Facebook/Meta ad content at scale — enter a brief, get 10 ad scripts across three funnel stages, approve the ones you like, drop in background videos and music, render.

## System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (React)                       │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ 1. Brief │→│ 2. Review │→│ 3. Media  │→│ 4. Render │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │              │              │              │          │
└───────┼──────────────┼──────────────┼──────────────┼──────────┘
        │              │              │              │
        ▼              ▼              ▼              ▼
  /api/generate-ads  /api/generate-ads  /api/upload     /api/render
  (Claude API)       (regenerate)    /api/upload-music  (FFmpeg)
                                     /api/generate-video
                                     (Google Veo)
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Next.js 14 (App Router) | Server + client, API routes |
| Language | TypeScript | Type safety |
| Styling | Tailwind CSS | Utility-first dark theme |
| Video processing | FFmpeg (shell exec) | Compositing, scaling, audio mixing |
| Overlay rendering | @napi-rs/canvas | Text-to-PNG with emoji support |
| AI copy generation | Anthropic SDK (Claude Sonnet) | TOFU/MOFU/BOFU ad scripts |
| AI video generation | Google Veo 3.1 | Optional AI background videos |
| Logging | Winston + daily-rotate-file | Server-side structured logs |
| IDs | uuid v4 | Unique file and entity IDs |

## App Flow

### Step 1: Brief
User fills in a rich brief form with 6 fields:
- Product/service (required)
- Target audience
- Key selling points
- Examples of winning ads
- Tone/style
- Additional context

Submits to `/api/generate-ads` which calls Claude to generate 10 ad scripts.

### Step 2: Review
10 ads displayed in a tabbed UI grouped by funnel stage:
- **TOFU** (4 variations) — Awareness, hooks, curiosity
- **MOFU** (4 variations) — Trust, social proof, education
- **BOFU** (2 variations) — Urgency, CTAs, conversion

Each ad has 4-5 editable text boxes. User can:
- Edit any text box inline
- Approve or reject each ad
- Regenerate any single ad (calls Claude again for just that one)
- Approve all at once

### Step 3: Media
- Upload background videos (drag-drop, multiple) or generate via Veo
- Upload background music (optional) with volume/fade controls
- Configure overlay style: preset picker + custom colours, font, opacity, stagger timing
- Preview any approved ad overlaid on the video in a 9:16 preview player
- Music duration warnings shown if fade settings don't fit video

### Step 4: Render
- Each approved ad × each uploaded video = one output
- FFmpeg composites overlay PNGs onto scaled 1080×1920 video
- Progress bar with "X of Y videos" counter
- Partial failure handling — failed renders don't block the rest
- Download individual videos or "Download All"

## File Structure

```
src/
├── app/
│   ├── page.tsx                    # Main 4-step flow controller
│   ├── layout.tsx                  # Root layout + metadata
│   ├── globals.css                 # Tailwind + custom styles
│   └── api/
│       ├── generate-ads/route.ts   # Claude API → ad copy
│       ├── generate-video/route.ts # Google Veo → AI videos
│       ├── render/route.ts         # FFmpeg batch render
│       ├── upload/route.ts         # Video file upload
│       ├── upload-music/route.ts   # Music file upload
│       ├── log/route.ts            # Client log ingestion
│       └── logs/route.ts           # Log retrieval
├── components/
│   ├── AdBriefForm.tsx             # Brief input (6 fields)
│   ├── FunnelReview.tsx            # Tabbed ad review + approve/edit/regen
│   ├── StyleConfigurator.tsx       # Overlay style presets + custom controls
│   ├── VideoSourceTabs.tsx         # Upload vs AI generate tabs
│   ├── VideoUploader.tsx           # Drag-drop video upload
│   ├── VideoGenerator.tsx          # Veo video generation
│   ├── MusicSelector.tsx           # Music upload + volume/fade
│   ├── VideoPreview.tsx            # Real-time 9:16 preview
│   ├── TextOverlayEditor.tsx       # Manual overlay editor
│   └── LogViewer.tsx               # Debug log viewer
└── lib/
    ├── types.ts                    # All TypeScript interfaces + constants
    ├── ffmpeg-renderer.ts          # FFmpeg render pipeline
    ├── overlay-renderer.ts         # Canvas → PNG overlay generation
    ├── get-video-info.ts           # ffprobe metadata + FFmpeg check
    └── logger.ts                   # Winston logger config
```

## Rendering Pipeline

```
1. Sort overlays by startTime
2. For each overlay:
   a. Render text to PNG via @napi-rs/canvas (supports emoji)
   b. Calculate vertical stacking position
3. Build FFmpeg command:
   a. Scale/crop input video to 1080×1920 (9:16)
   b. Chain overlay filters with enable='between(t,start,end)'
   c. If music: mix audio tracks with fade in/out
4. Execute FFmpeg, return output path
5. Clean up temporary overlay PNGs
```

### Why Canvas PNGs instead of FFmpeg drawtext?
FFmpeg's `drawtext` filter renders emoji as empty squares. By rendering text to PNG with @napi-rs/canvas (which uses system emoji fonts), we get full emoji support. The PNGs are then composited using FFmpeg's `overlay` filter.

## Data Flow

### Types
- `AdBrief` — 6 string fields describing what to advertise
- `GeneratedAd` — id, funnelStage, variationLabel, textBoxes[], approved
- `TextOverlay` — id, text, startTime, endTime, position, style
- `TextStyle` — fontSize, fontWeight, textColor, bgColor, bgOpacity, borderRadius, padding, maxWidth, textAlign
- `UploadedVideo` — id, filename, path, duration, width, height, thumbnail
- `MusicTrack` — id, name, file, volume, fadeIn, fadeOut

### State (all in page.tsx)
- `step` — which wizard step is active
- `brief` — the current ad brief
- `ads` — array of GeneratedAd (10 items after generation)
- `videos` — uploaded/generated video files
- `music` — optional music track
- `overlayStyle` — current TextStyle for rendering
- `staggerSeconds` — seconds between text box appearances
- `results` — rendered video output URLs

## API Routes

| Route | Method | Purpose | Timeout |
|-------|--------|---------|---------|
| `/api/generate-ads` | POST | Generate ad copy via Claude | 60s |
| `/api/generate-video` | POST | Generate video via Veo | 300s |
| `/api/upload` | POST | Upload video files (max 500MB each) | 60s |
| `/api/upload-music` | POST | Upload music (max 50MB, validated formats) | default |
| `/api/render` | POST | Batch FFmpeg render | 300s |
| `/api/log` | POST | Ingest client-side logs | default |
| `/api/logs` | GET | Retrieve recent log lines | default |

## Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...    # Required for ad copy generation
GOOGLE_API_KEY=...               # Optional for Veo video generation
```

## Validation

- **Video upload**: File size (500MB max), ffprobe metadata extraction, codec detection
- **Music upload**: File size (50MB max), format whitelist (.mp3/.wav/.aac/.m4a/.ogg/.flac)
- **FFmpeg**: Availability checked on first use, cached
- **AI responses**: JSON extraction with fallbacks (direct parse → strip fences → regex extract)
- **Render inputs**: Path traversal prevention, file existence checks
- **Music timing**: Warning shown if fade-out exceeds video duration

## Watchdog QA Agent

A standalone TypeScript script (`scripts/watchdog.ts`) that runs continuously alongside the dev server, performing automated health checks, API tests, stress tests, and auto-remediation.

### Run
```bash
npm run watchdog
```

### What it does (5 phases per cycle, every 45s)
1. **Health Checks** — server responding, required directories exist, FFmpeg available, env vars set
2. **API Functional Tests** — tests all 7 endpoints (upload, render, log, music, validation, path traversal)
3. **Stress Tests** — concurrent requests, rapid sequential writes, parallel uploads
4. **File System Checks** — orphaned files, old files (>24h), disk space, leftover temp dirs
5. **Remediation** — auto-restart downed server, create missing dirs, clean old files

### Config
`scripts/watchdog.config.json` — all fields overridable via `WATCHDOG_*` env vars. Paid API tests (generate-ads, generate-video) disabled by default.

### Output
- Colored terminal output with `[PASS]`/`[FAIL]`/`[WARN]`/`[SKIP]`/`[FIX]` tags
- JSON report at `watchdog-report.json` (last 50 cycles)
- Test artifacts auto-cleaned after each cycle

### Files
```
scripts/
├── watchdog.ts            # Main watchdog script
├── watchdog.config.json   # Config with defaults
└── fixtures/              # Auto-generated test video + audio (gitignored)
```

## Prerequisites

- Node.js 18+
- FFmpeg installed (`brew install ffmpeg` / `apt install ffmpeg`)
- Anthropic API key for ad copy generation
- Google API key for Veo video generation (optional)
