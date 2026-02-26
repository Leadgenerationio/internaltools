# Architecture — Ad Maker

## Overview

A multi-tenant SaaS platform built on Next.js that generates funnel-based ad copy via AI, lets teams review and edit it, then batch-renders video ads with timed text overlays and background music using server-side FFmpeg.

Built for producing Facebook/Meta ad content at scale — users create accounts by company, manage team members with role-based access (OWNER/ADMIN/MEMBER), track API usage and costs in real-time, enter a brief, get 10 ad scripts across three funnel stages, approve the ones you like, drop in background videos and music, render.

## System Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Browser (React)                                │
│                                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐│
│  │ /welcome │  │ /login   │  │ /register│  │ /usage   │  │ /settings││
│  │ (landing)│  │ /company │  │ /users   │  │ (sidebar)│  │ (sidebar)││
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘│
│  ┌──────────┐  ┌──────────┐                                          │
│  │ /admin   │  │/projects │ ← List, create, delete projects          │
│  │ (platform│  │ (grid)   │                                          │
│  │  health) │  └──────────┘                                          │
│  └──────────┘                                                         │
│                                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ 1. Brief │→│ 2. Review │→│ 3. Media  │→│ 4. Render │              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│       │              │              │              │                    │
└───────┼──────────────┼──────────────┼──────────────┼────────────────────┘
        │              │              │              │
        ▼              ▼              ▼              ▼
  /api/generate-ads  /api/generate-ads  /api/upload     /api/render
  (Claude API)       (regenerate)    /api/upload-music  (FFmpeg)
  (Cost tracking)                    /api/generate-video (Cost tracking)
                                     (Google Veo)
                                     (Cost tracking)
        │
        ▼
  PostgreSQL (Prisma)
  - Companies
  - Users (roles: OWNER/ADMIN/MEMBER)
  - Projects (with ads, videos, music, renders)
  - API usage logs (per-call tracking in cents)
  - Sessions (JWT)
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Next.js 14 (App Router) | Server + client, API routes |
| Language | TypeScript | Type safety |
| Styling | Tailwind CSS | Utility-first dark theme |
| Database | PostgreSQL + Prisma ORM | Multi-tenant data, users, API usage tracking |
| Authentication | NextAuth v5 | JWT sessions, credentials provider, user/session management |
| Video processing | FFmpeg (shell exec) | Compositing, scaling, audio mixing |
| Overlay rendering | @napi-rs/canvas | Text-to-PNG with emoji support |
| AI copy generation | Anthropic SDK (Claude Sonnet) | TOFU/MOFU/BOFU ad scripts |
| AI video generation | Google Veo 3.1 | Optional AI background videos |
| Cost tracking | Prisma + Winston | Per-call API usage logging in cents, monthly aggregation |
| Logging | Winston + daily-rotate-file | Server-side structured logs |
| IDs | uuid v4 | Unique file and entity IDs |

## Authentication & Multi-Tenancy

### User Registration & Login
- `/welcome` — Public marketing landing page (hero, features grid, pricing tiers, footer)
- `/register` — New user registration with email, password, company name
- `/login` — Email + password authentication via NextAuth credentials provider
- JWT sessions stored in httpOnly cookies
- Middleware verifies JWT on every request, redirects unauthenticated users to `/login` (or `/welcome` for first-time visitors)

### Multi-Tenant Structure
- **Company** record owns users, projects, API usage
- **User** roles within a company: OWNER (full access), ADMIN (manage team + settings), MEMBER (create projects, view own usage)
- All data queries filtered by company_id from session
- Company users can be invited via `/api/company/invite` (email-based invitations)

### API Cost Tracking
- **Per-call logging**: Each call to generate-ads, generate-video, render records:
  - API name, timestamp, user_id, company_id, input/output tokens (or units)
  - Cost in cents (calculated from model pricing + actual usage)
- **Monthly aggregation**: `/api/usage` endpoint returns:
  - Total spend (current month), per-service breakdown, per-user breakdown
  - Historical monthly trends
  - Warnings if approaching monthly spend limits (configurable per company)
- **Usage tracking helper** (`src/lib/track-usage.ts`):
  - `trackUsage(apiName, costInCents, metadata)` — logs to database after operation
  - `getMonthlyUsage(companyId, month)` — retrieves aggregated data
  - `getServiceBreakdown(companyId)` — costs per service for current month

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
│   ├── page.tsx                      # Main 4-step flow controller (requires auth)
│   ├── layout.tsx                    # Root layout + metadata
│   ├── globals.css                   # Tailwind + custom styles
│   ├── welcome/
│   │   └── page.tsx                  # Public landing page (hero, features, pricing)
│   ├── login/
│   │   └── page.tsx                  # NextAuth login page (email + password)
│   ├── register/
│   │   └── page.tsx                  # Registration page (new company + user)
│   ├── projects/
│   │   └── page.tsx                  # Projects list: grid of cards, create/delete, pagination
│   ├── usage/
│   │   └── page.tsx                  # Dashboard: monthly spend, per-service breakdown
│   ├── settings/
│   │   └── page.tsx                  # Company settings: users, invitations, spend limits
│   ├── admin/
│   │   └── page.tsx                  # Super admin dashboard: all companies, revenue, API calls
│   └── api/
│       ├── auth/[...nextauth]/
│       │   └── route.ts              # NextAuth v5 credentials provider
│       ├── auth/register/route.ts    # Register new user + company
│       ├── company/users/route.ts    # List, add, remove users from company
│       ├── company/invite/route.ts   # Send email invitations to join company
│       ├── usage/route.ts            # Get monthly spend + service breakdown
│       ├── admin/route.ts            # Super admin: platform-wide stats + company breakdown
│       ├── projects/route.ts         # List + create projects (GET/POST)
│       ├── projects/[id]/route.ts   # Get, update, delete project (GET/PUT/DELETE)
│       ├── projects/[id]/ads/
│       │   └── route.ts             # Save ads to project (POST — replace all)
│       ├── generate-ads/route.ts     # Claude API → ad copy (+ cost tracking)
│       ├── generate-video/route.ts   # Google Veo → AI videos (+ cost tracking)
│       ├── render/route.ts           # FFmpeg batch render + cloud storage (+ cost tracking)
│       ├── upload/route.ts           # Video file upload
│       ├── upload-music/route.ts     # Music file upload
│       ├── download-zip/route.ts     # Bundle outputs into ZIP
│       ├── log/route.ts              # Client log ingestion
│       └── logs/route.ts             # Log retrieval
├── components/
│   ├── AdBriefForm.tsx               # Brief input (6 fields)
│   ├── FunnelReview.tsx              # Tabbed ad review + approve/edit/regen + copy text
│   ├── StyleConfigurator.tsx         # Overlay style presets + custom controls + template library
│   ├── VideoSourceTabs.tsx           # Upload vs AI generate tabs
│   ├── VideoUploader.tsx             # Drag-drop video upload with cancel
│   ├── VideoGenerator.tsx            # Veo video generation with cancel
│   ├── MusicSelector.tsx             # Upload and configure background music
│   ├── VideoPreview.tsx              # Real-time 9:16 preview + trim controls
│   ├── TextOverlayEditor.tsx         # Manual overlay editor
│   ├── LogViewer.tsx                 # Debug log viewer
│   ├── UsageWidget.tsx               # Real-time cost display during operations
│   └── SettingsPanel.tsx             # Company users, invitations, spend limits
├── middleware.ts                     # Auth verification, JWT validation, rate limiting
├── lib/
│   ├── types.ts                      # All TypeScript interfaces + constants
│   ├── ffmpeg-renderer.ts            # FFmpeg render pipeline (draft/final quality, trim)
│   ├── overlay-renderer.ts           # Canvas → PNG overlay generation
│   ├── get-video-info.ts             # ffprobe metadata + FFmpeg check
│   ├── storage.ts                    # Cloud storage abstraction (local FS / S3 / R2)
│   ├── logger.ts                     # Winston logger config
│   ├── prisma.ts                     # Prisma client singleton
│   ├── auth.ts                       # NextAuth session helpers, user context
│   ├── pricing.ts                    # API cost calculation per model/tokens
│   ├── track-usage.ts                # Per-call usage logging, monthly aggregation
│   └── api-auth.ts                   # Auth middleware helpers for API routes
├── prisma/
│   ├── schema.prisma                 # Data models: Company, User, Session, ApiUsage
│   └── migrations/                   # Database migrations
└── auth.config.ts                    # NextAuth v5 configuration
```

## Rendering Pipeline

```
1. Sort overlays by startTime
2. For each overlay:
   a. Render text to PNG via @napi-rs/canvas (supports emoji)
   b. Use PREVIEW_* scale constants (matching VideoPreview.tsx CSS) to size
      text, padding, border-radius, gaps, and fit-content box width
   c. Calculate vertical stacking position (starting Y = 10% of output width)
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
- `UploadedVideo` — id, filename, path, duration, width, height, thumbnail, trimStart?, trimEnd?
- `MusicTrack` — id, name, file, volume, fadeIn, fadeOut

### State (all in page.tsx)
- `step` — which wizard step is active
- `brief` — the current ad brief
- `ads` — array of GeneratedAd (10 items after generation)
- `videos` — uploaded/generated video files
- `music` — optional music track
- `overlayStyle` — current TextStyle for rendering
- `staggerSeconds` — seconds between text box appearances
- `renderQuality` — 'draft' (fast, lower quality) or 'final' (slow, high quality)
- `results` — rendered video output URLs

## API Routes

| Route | Method | Purpose | Timeout | Auth |
|-------|--------|---------|---------|------|
| `/api/auth/[...nextauth]` | GET/POST | NextAuth v5 endpoints (login, callback, signout) | default | public |
| `/api/auth/register` | POST | Create new user + company | default | public |
| `/api/company/users` | GET/POST | List/add users to company | default | required (OWNER/ADMIN) |
| `/api/company/invite` | POST | Send email invitation to join company | default | required (OWNER/ADMIN) |
| `/api/usage` | GET | Get monthly spend + service breakdown | default | required |
| `/api/admin` | GET | Platform-wide stats, company breakdown, recent calls | default | required (super admin) |
| `/api/projects` | GET | List projects for user's company (paginated) | default | required |
| `/api/projects` | POST | Create a new project | default | required |
| `/api/projects/[id]` | GET | Get project with all related data | default | required |
| `/api/projects/[id]` | PUT | Update project fields | default | required |
| `/api/projects/[id]` | DELETE | Delete project (cascades, OWNER/ADMIN/creator only) | default | required |
| `/api/projects/[id]/ads` | POST | Save ads to project (replace all) | default | required |
| `/api/generate-ads` | POST | Generate ad copy via Claude | 60s | required + cost tracking |
| `/api/generate-video` | POST | Generate video via Veo | 300s | required + cost tracking |
| `/api/upload` | POST | Upload video files (max 500MB each) | 60s | required |
| `/api/upload-music` | POST | Upload music (max 50MB, validated formats) | default | required |
| `/api/render` | POST | Batch FFmpeg render (supports draft/final quality, trim) | 300s | required + cost tracking |
| `/api/download-zip` | POST | Bundle rendered videos into a ZIP file | default | required |
| `/api/log` | POST | Ingest client-side logs | default | public |
| `/api/logs` | GET | Retrieve recent log lines | default | required |

## Environment Variables

```
# Database
DATABASE_URL=postgresql://...    # Required — PostgreSQL connection string for Prisma

# Authentication & Sessions
NEXTAUTH_SECRET=...              # Required — 32+ char random string for JWT signing
NEXTAUTH_URL=http://localhost:3000  # Required — Base URL for NextAuth callbacks

# API Keys
ANTHROPIC_API_KEY=sk-ant-...     # Required for ad copy generation
GOOGLE_API_KEY=...               # Optional for Veo video generation

# Super Admin
SUPER_ADMIN_EMAILS=admin@example.com  # Comma-separated list of super admin emails

# Cloud Storage (optional)
S3_BUCKET=your-bucket            # Optional — enable cloud storage (S3/R2)
S3_ENDPOINT=https://...          # Required with S3_BUCKET
S3_ACCESS_KEY_ID=...             # Required with S3_BUCKET
S3_SECRET_ACCESS_KEY=...         # Required with S3_BUCKET
S3_PUBLIC_URL=https://...        # Optional — public URL prefix for S3 files

# Email (for invitations)
EMAIL_FROM=noreply@example.com   # Required for company invitations
SMTP_HOST=smtp.example.com       # Required for email invitations
SMTP_PORT=587                    # Required for email invitations
SMTP_USER=...                    # Required for email invitations
SMTP_PASS=...                    # Required for email invitations
```

## Security

### Authentication & Authorization
- **JWT sessions**: NextAuth v5 credentials provider, httpOnly cookies with JWT tokens
- **Middleware verification** (`src/middleware.ts`): Verifies JWT on every request, redirects to `/login` if invalid
- **Company isolation**: All data queries filtered by `session.user.company_id`, enforces multi-tenant data boundaries
- **Role-based access control**: OWNER (full access), ADMIN (manage team + settings), MEMBER (create projects only)
- **Password hashing**: bcryptjs for secure password storage

### Middleware (`src/middleware.ts`)
- **JWT verification**: Validates session tokens, refreshes if needed
- **Rate limiting**: Per-IP rate limits on all API routes (configurable per-route), stricter limits on costly operations (generate-ads, render)
- **CORS**: Explicit `Access-Control-Allow-Origin` restricted to allowed origins
- **Security headers**: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, X-XSS-Protection, Permissions-Policy, Content-Security-Policy
- **Preflight handling**: OPTIONS requests for CORS

### Shell Command Safety
- All FFmpeg/ffprobe calls use `execFile()` (no shell invocation) instead of `exec()`
- Arguments passed as arrays, never interpolated into command strings
- Prevents shell injection via crafted filenames or user input

### Input Validation
- All JSON API routes validate payload size before parsing
- `/api/log`: message type/length validation, metadata key limiting, field sanitization
- `/api/logs`: path traversal prevention with `isPathSafe()` boundary checks
- Upload routes: file size limits, extension whitelists

### Log Sanitization
- Logger automatically redacts API keys, tokens, and secret patterns
- Home directory paths replaced with `~` to prevent username leakage
- Fields named password/secret/token/apikey automatically redacted
- Production log level set to `warn` (suppresses debug/info)

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

## Security Agent

A standalone TypeScript script (`scripts/security.ts`) that performs continuous security auditing of the codebase, configuration, and runtime environment.

### Run
```bash
npm run security          # Continuous mode (every 30 minutes)
npm run security:once     # Single scan, exit with code: 0=clean, 1=high, 2=critical
```

### What it checks (12 categories)
1. **Blast Radius** — exec() usage, fs write/delete operations, env var access surface
2. **Network Exposure** — open ports, wildcard binds, missing CORS, missing middleware
3. **Browser Control** — dangerouslySetInnerHTML, eval(), CSP headers, localStorage usage
4. **Local Disk Hygiene** — dir sizes, temp files, core dumps, world-readable dirs, orphaned ffmpeg
5. **Plugin/Model Hygiene** — npm audit, outdated packages, known-risky deps, API key scope
6. **Credential Storage** — .env permissions, gitignore coverage, hardcoded secrets, git history leaks
7. **Reverse Proxy Config** — security headers (X-Frame-Options, HSTS, etc.), poweredBy, HTTPS
8. **Session Logs** — log size/age, secrets in logs, PII leaks, unsanitized metadata, unauthenticated log endpoints
9. **Shell Injection** — exec() with template interpolation, user input in shell commands
10. **Input Validation** — unvalidated JSON bodies, missing payload size limits, missing rate limiting
11. **Path Traversal** — file ops without isPathSafe() boundary checks
12. **Secrets in Git History** — env files in commits, API keys in diffs, large blobs

### Config
`scripts/security.config.json` — toggle individual checks, set thresholds, enable auto-remediation. All fields overridable via `SECURITY_*` env vars.

### Output
- Color-coded terminal output with severity tags: `CRITICAL`, `[HIGH]`, `[MEDIUM]`, `[LOW]`, `[INFO]`
- JSON report at `security-report.json` (last 50 scans, gitignored)
- Exit codes for CI integration

### Files
```
scripts/
├── security.ts            # Main security agent script
└── security.config.json   # Config with defaults + thresholds
```

## Cloud Storage (`src/lib/storage.ts`)

Abstraction layer that defaults to local filesystem and switches to S3-compatible storage (AWS S3, Cloudflare R2, etc.) when `S3_BUCKET` is configured.

- **Local mode** (default): Files stay on disk in `public/`, URLs are relative paths
- **Cloud mode**: Files uploaded to S3 after processing, local copies cleaned up
- AWS SDK is lazy-loaded — only imported when cloud storage is actually configured
- Currently integrated into the render route (output videos uploaded to S3)

## Video Trimming

Users can trim uploaded videos before rendering:
- Trim controls in VideoPreview (start/end range sliders)
- `trimStart`/`trimEnd` stored on `UploadedVideo` and passed to FFmpeg
- FFmpeg uses `-ss` (seek before input) and `-t` (duration limit) for efficient trim
- Overlay timing is based on trimmed duration

## Render Quality

Two render quality modes selectable before rendering:
- **Draft**: `preset=ultrafast`, `crf=28` — fast encoding, lower quality, good for previewing
- **Final**: `preset=fast`, `crf=23` — slower encoding, higher quality, for production use

## Password Protection

Optional app-wide password protection via `APP_PASSWORD` env var:
- Middleware redirects unauthenticated users to `/login`
- Login page posts to `/api/auth` which validates and sets an httpOnly cookie
- Cookie is base64-encoded password, checked in middleware on every request
- No password set = no protection (open access)

## UX Features

- **Cancel buttons**: AbortController on all long-running operations (generate, render, upload)
- **ZIP download**: Server-side ZIP creation via `/api/download-zip` for "Download All"
- **Auto-dismiss**: Success messages auto-clear after 8 seconds
- **Copy ad text**: Clipboard button on each ad card in FunnelReview
- **Template library**: Save/load overlay style presets to localStorage
- **Mobile-responsive**: Render results grid adapts to screen size

## Deployment

- **Platform**: Railway (Docker-based)
- **Dockerfile**: Multi-stage build — builder with native dependencies, runner with runtime libs + FFmpeg
- **Output**: Next.js standalone mode (`output: 'standalone'` in next.config.js)
- **Auto-deploy**: Git agent (`npm run git-agent`) watches for file changes and auto-pushes to GitHub, triggering Railway auto-deploy

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ (local or remote)
- FFmpeg installed (`brew install ffmpeg` / `apt install ffmpeg`)
- Anthropic API key for ad copy generation
- Google API key for Veo video generation (optional)
- SMTP server for email invitations (or use sendgrid/mailgun with adapter)
- 32+ char random string for `NEXTAUTH_SECRET`
