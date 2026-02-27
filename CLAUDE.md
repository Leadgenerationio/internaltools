# Claude Code Rules — Ad Maker

## Mandatory: Keep Documentation In Sync

After completing any new feature, major change, or architectural decision, **always** update these files before declaring done:

- **`ARCHITECTURE.md`** — Update file structure, data flow, API routes, or system diagram if anything changed
- **`CLAUDE.md`** (this file) — Update architecture notes or add new rules if the change revealed a pattern worth enforcing
- **`.cursorrules`** — Update file structure, key concepts, or guidelines if anything changed
- **Memory files** (`~/.claude/projects/.../memory/`) — Update if the change affects project structure, key files, or conventions

Don't ask whether to update them — just do it as part of finishing the work.

## Mandatory: Post-Implementation Review & Fixes

After writing any feature or making any change, **always** do a self-review pass before declaring done. Fix everything you find — don't just report it.

### Bug checks (always verify these)

1. **Stale closures in async callbacks.** Any `async` handler that references state (e.g. `videos`, `ads`) and runs for more than a few seconds is likely stale by the time it resolves. Use refs, callback-form setState, or re-fetch current state before merging results.

2. **`Promise.all` vs `Promise.allSettled`.** If firing parallel async operations where partial success is useful (e.g. generating multiple videos, rendering multiple ads), always use `Promise.allSettled` and return partial results with per-item error reporting. Never throw away successful work because one item failed.

3. **Timeout alignment.** When a Next.js route has `maxDuration` and the code has its own polling/timeout, ensure the code timeout is strictly less than `maxDuration` so the user gets a clean error message instead of a connection reset.

4. **Orphaned resources.** If a multi-step server operation (download file, then process it, then thumbnail it) fails midway, clean up files already written to disk. Use try/finally or a cleanup array.

5. **UI state consistency on tab/step switches.** If an async operation is running (upload, generation, render), either disable navigation away from that step/tab, or ensure the operation completes gracefully with proper feedback when the user returns.

6. **No lingering status messages.** Success/done banners should auto-dismiss after 5 seconds or clear when the user starts a new interaction. Don't leave stale "Done!" messages sitting permanently.

### Code quality checks (always apply these)

7. **Extract duplicated logic.** If two routes or components have the same pattern (e.g. ffprobe + thumbnail generation), extract it into a shared helper immediately. Don't leave it for later.

8. **Dead code.** If you define a type, interface, function, or variable that nothing imports or uses, delete it before finishing. Run a quick grep to verify.

9. **Dynamic labels.** Headings, button text, and status messages should reflect the actual context. Don't hardcode "Upload Videos" on a tab that also does AI generation — make it dynamic or generic.

10. **AbortController on long fetches.** Any client-side fetch that can run longer than 10 seconds should use an AbortController that aborts on component unmount and offers a cancel button to the user.

## Mandatory: Proactive Improvements

When implementing a feature, don't stop at the minimum. Always also implement these patterns where applicable:

### Resilience

- **Rate limiting / debounce on expensive operations.** Any button that triggers an API call costing real money (AI generation, external API calls) must be debounced and should have a confirmation step or cost estimate.
- **Retry with exponential backoff** for polling loops. Never use fixed intervals — start fast (3-5s), back off to 15-30s.
- **Cancellation support** for any operation that takes more than a few seconds. Both client-side (AbortController) and server-side where the API supports it.

### UX

- **Real-time progress for long operations.** If an operation takes >10 seconds, use SSE or polling a status endpoint — never a single blocking fetch with just a spinner. Show per-item progress where possible.
- **Partial results are better than nothing.** If 3/4 videos generated successfully, show those 3 with a retry button on the failed one. Never throw away work.
- **Preview before committing.** When generating content (videos, ad copy), let users preview and selectively accept results before they're added to the project.

### Architecture

- **Background jobs for operations >30 seconds.** Long operations should return a job ID immediately. The client polls a status endpoint. This survives page refreshes, avoids HTTP timeouts, and lets you show progress.
- **Shared utilities, not copy-paste.** ffprobe metadata + thumbnail generation should be one function, not duplicated across upload and generate routes.
- **Cleanup mechanisms.** Any feature that writes files to disk must consider cleanup. Add created-at timestamps and a mechanism to purge old files.

## Architecture Notes

- **Framework**: Next.js 14 App Router + TypeScript + Tailwind CSS
- **Database**: PostgreSQL + Prisma ORM for multi-tenant data storage (companies, users, API usage)
- **Authentication**: NextAuth v5 with credentials provider (email + password), JWT sessions in httpOnly cookies
- **Multi-tenancy**: Companies own users with roles (OWNER/ADMIN/MEMBER); all queries filtered by `company_id` from session
- **Video processing**: FFmpeg via shell exec, @napi-rs/canvas for emoji-supporting overlay PNGs
- **AI ad copy**: Anthropic SDK (Claude Sonnet) — generates TOFU/MOFU/BOFU funnel ad text
- **AI video generation**: kie.ai REST API — models veo3_fast ($0.40/video) and veo3 ($2.00/video), fixed 8s duration (optional)
- **Token billing**: Users pay in tokens (1 token = 1 finished video, 10 tokens = 1 kie.ai AI video bundled with renders). Ad copy generation is FREE. See `src/lib/token-pricing.ts`, `src/lib/token-balance.ts`.
- **Internal cost tracking**: Per-call API cost logging (in cents) via `src/lib/track-usage.ts` — admin-only, hidden from users
- **Files**: uploads in `public/uploads/`, music in `public/music/`, outputs in `public/outputs/` — symlinked to Railway Volume (`/app/data`) via `docker-entrypoint.sh`
- **File serving**: All file URLs use `/api/files?path=xxx` — Next.js standalone doesn't serve runtime files from `public/`. Always use `fileUrl()` from `src/lib/file-url.ts` to generate URLs. Files are streamed via `createReadStream()` with HTTP Range header support (not `readFile()`).
- **Cloud storage**: Optional S3/R2 via `src/lib/storage.ts` — activated by `S3_BUCKET` env var, lazy-loads AWS SDK, streaming uploads via `@aws-sdk/lib-storage` (no full-file buffering)
- **CDN file serving**: When `CDN_URL` or `S3_PUBLIC_URL` is set, `fileUrl()` returns direct CDN URLs instead of `/api/files`, offloading file serving from Node.js
- **Atomic token deduction**: `deductTokens()` uses raw SQL (`UPDATE ... WHERE balance >= amount RETURNING balance`) to prevent TOCTOU race conditions between concurrent requests
- **Streaming uploads**: `/api/upload` streams files to disk via `Readable.fromWeb()` + `pipeline()` — never buffers 500MB files in memory
- **Auth**: NextAuth v5 credentials provider — JWT sessions, `AUTH_SECRET` env var for signing, `secureCookie: true` in middleware for reverse proxy compatibility
- **Redis**: Optional `ioredis` via `src/lib/redis.ts` — lazy connection from `REDIS_URL`, graceful fallback to in-memory when unavailable. Used for rate limiting (`src/lib/rate-limit.ts`) and caching (`src/lib/cache.ts`).
- **Caching**: Redis-backed TTL cache. Company plan/balance (10s), notification unread count (15s). Invalidated on writes. Falls back to direct DB queries without Redis.
- **Rate limiting**: Dual-layer — in-memory in Edge middleware (per-instance), Redis sorted-set sliding window in `src/lib/rate-limit.ts` (cross-instance, for API routes).
- **DB connection pool**: Explicit `pg.Pool` in `src/lib/prisma.ts` with `max: 20` (configurable via `DB_POOL_SIZE`), `connectionTimeoutMillis: 5000`.
- **State management**: React useState, no external store
- **Logging**: Winston with daily-rotate-file, client-side log helper POSTs to `/api/log`
- **App flow**: 4-step wizard — Brief → Review → Media → Render (requires authenticated user)
- **Overlay rendering**: Canvas PNG approach (not FFmpeg drawtext) for emoji support
- **Video trimming**: Users can trim videos via range sliders in VideoPreview; FFmpeg uses `-ss`/`-t` flags
- **Render quality**: Draft (ultrafast/crf28) vs Final (fast/crf23) selectable before render
- **Dark themed UI**: gray-950 background, gray-800 cards, blue-500 accents, green-600 action buttons
- **No branding in ads**: "Andro Media" = Meta's ad system, not a brand to put in generated copy
- **Super admin dashboard**: Full control panel at `/admin` with 5 tabs (Overview, Companies, Users, Transactions, Support). API routes at `/api/admin/*`. Access gated by `SUPER_ADMIN_EMAILS` env var. Features: company management (plan change, suspension, token grants), user impersonation, platform-wide transaction viewer, audit logging via `AdminAuditLog` model. Auth helper at `src/lib/admin-auth.ts`.
- **Company suspension**: `suspended` flag on Company model. When suspended, `getAuthContext()` in `api-auth.ts` blocks all API calls with 403. Suspended users see `/suspended` page. Suspension requires typing company name to confirm.
- **Plan enforcement**: Plan tiers (FREE 40tok/STARTER 500tok £29/PRO 2500tok £99/ENTERPRISE custom) in `src/lib/plans.ts`. Token balance checked in `src/lib/check-limits.ts` before render and kie.ai video operations. User limits checked on invite.
- **Token budget alerts**: Webhook notifications at 50%/80%/100% of monthly token budget via `src/lib/spend-alerts.ts`. Alert state stored in `SpendAlertLog` DB table (not in-memory) — survives restarts, works across instances.
- **Projects**: CRUD API at `/api/projects`, list page at `/projects`, ads save at `/api/projects/[id]/ads`
- **Billing & Stripe**: Token balance + plan comparison at `/billing`, token transaction history at `/usage`, monthly token budget editable in settings. Stripe Checkout for subscriptions (`/api/billing/create-checkout`) and one-time token top-ups. Stripe Customer Portal for subscription management (`/api/billing/manage`). Webhook at `/api/webhooks/stripe` handles checkout completion, invoice renewals, subscription changes/cancellations — **idempotent** via `ProcessedWebhookEvent` deduplication table. Stripe client singleton at `src/lib/stripe.ts`. Company model stores `stripeCustomerId` + `stripeSubscriptionId`.
- **Transactional email**: Resend SDK via `src/lib/email.ts` — 11 templates (welcome, password reset, plan upgrade, budget alert, payment receipt, team invite, render complete, render failed, subscription renewal, ticket created, ticket reply). Fire-and-forget, dark-themed HTML.
- **Password reset**: Token-based reset flow at `/api/auth/reset-password` + `/reset-password` page (sends email via Resend). Tokens stored in `PasswordResetToken` DB table (not in-memory).
- **CSV export**: Token transaction data downloadable as CSV from `/api/usage/export`
- **Company logo**: Upload at `/api/company/logo`, displayed in settings
- **Help & Legal**: `/help` page (~28 FAQ articles, search, accordions), `/privacy` (GDPR-compliant), `/terms` (15 sections). All public routes.
- **Tooltips & banners**: `Tooltip.tsx` (reusable info icon with hover text), `InfoBanner.tsx` (info/tip/warning banners). Added throughout the app for beginner-friendly UX.
- **SEO**: Dynamic favicon (`icon.tsx`), OG images (`opengraph-image.tsx`), `robots.ts`, `sitemap.ts`, `manifest.json`, per-page metadata via layout files.
- **Background jobs**: BullMQ + Redis for async render and video generation. Routes enqueue jobs and return `{ jobId }` immediately. Client polls `/api/jobs/[id]` with exponential backoff (3s→15s). Workers run as separate Railway service (`WORKER_MODE=true`). Graceful degradation: falls back to synchronous when `REDIS_URL` not set.
- **Redis**: ioredis singleton at `src/lib/redis.ts` — lazy connection from `REDIS_URL`. Used for BullMQ queues, rate limiting (sorted-set sliding window), caching (company info 10s TTL, notification counts 15s TTL). All Redis features degrade gracefully when not configured.
- **Deployment**: Railway with Docker, `output: 'standalone'` in next.config.js, Railway Volume at `/app/data` for persistent storage, `docker-entrypoint.sh` for startup (symlinks + migrate + serve). Worker service uses same Docker image with `WORKER_MODE=true`.
- **Watchdog QA**: `npm run watchdog` — standalone script that continuously tests all endpoints, checks health, stress-tests, and auto-remediates (restart server, create dirs, clean old files). Config in `scripts/watchdog.config.json`
- **Security Agent**: `npm run security` — continuous security audit (blast radius, network exposure, browser control, disk hygiene, plugin hygiene, credentials, reverse proxy, session logs, shell injection, input validation, path traversal, secrets in git history). Config in `scripts/security.config.json`. `npm run security:once` for single scan with CI-friendly exit codes.
- **Support ticketing**: Full ticket system. User pages at `/tickets` (list), `/tickets/new` (create), `/tickets/[id]` (detail with threaded messages). Admin routes at `/api/admin/tickets/*`. Auto-incrementing ticket numbers. Email notifications on create and reply. Category/priority/status filtering. Input sanitization via `src/lib/sanitize.ts`. Models: `SupportTicket`, `TicketMessage`.
- **Google Drive export**: OAuth2 integration for exporting rendered videos to Google Drive. Connect/disconnect in Settings. 6 API routes at `/api/integrations/google-drive/*` (auth, callback, disconnect, status, folders, export). `GoogleDriveButton` component shown in render results. User model stores `googleDriveRefreshToken`, `googleDriveConnected`, `googleDriveEmail`. Env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
- **In-app notifications**: `NotificationBell` component in header — bell icon with unread badge, dropdown with recent notifications, 30s polling. API routes: `/api/notifications` (list), `/api/notifications/[id]/read`, `/api/notifications/mark-all-read`. `Notification` model in Prisma.
- **Password change**: `/api/auth/change-password` route for authenticated password change (requires current password). Security section in Settings page.
- **Onboarding checklist**: `OnboardingChecklist` component — 5-step guided checklist for accounts less than 7 days old. Progress tracked via `/api/onboarding` (GET/PUT). Auto-dismisses after completion or age threshold.
- **Project templates**: 6 system templates seeded via `scripts/seed-templates.ts` + company-owned templates. `TemplatePickerModal` and `SaveAsTemplateModal` components in Brief step. Manage templates in Settings. API: `/api/templates` (list/create), `/api/templates/[id]` (CRUD), `/api/templates/[id]/use` (populate brief). `ProjectTemplate` model in Prisma.
