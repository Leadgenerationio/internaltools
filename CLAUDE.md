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
- **Video processing**: FFmpeg via shell exec, @napi-rs/canvas for emoji-supporting overlay PNGs
- **AI ad copy**: Anthropic SDK (Claude Sonnet) — generates TOFU/MOFU/BOFU funnel ad text
- **AI video generation**: Google Veo 3.1 (optional)
- **Files**: uploads in `public/uploads/`, music in `public/music/`, outputs in `public/outputs/`
- **Cloud storage**: Optional S3/R2 via `src/lib/storage.ts` — activated by `S3_BUCKET` env var, lazy-loads AWS SDK
- **Auth**: Optional password protection via `APP_PASSWORD` env var — middleware redirect to `/login`, httpOnly cookie
- **State management**: React useState, no external store
- **Logging**: Winston with daily-rotate-file, client-side log helper POSTs to `/api/log`
- **App flow**: 4-step wizard — Brief → Review → Media → Render
- **Overlay rendering**: Canvas PNG approach (not FFmpeg drawtext) for emoji support
- **Video trimming**: Users can trim videos via range sliders in VideoPreview; FFmpeg uses `-ss`/`-t` flags
- **Render quality**: Draft (ultrafast/crf28) vs Final (fast/crf23) selectable before render
- **Dark themed UI**: gray-950 background, gray-800 cards, blue-500 accents, green-600 action buttons
- **No branding in ads**: "Andro Media" = Meta's ad system, not a brand to put in generated copy
- **Deployment**: Railway with Docker, `output: 'standalone'` in next.config.js, auto-deploy via git-agent
- **Watchdog QA**: `npm run watchdog` — standalone script that continuously tests all endpoints, checks health, stress-tests, and auto-remediates (restart server, create dirs, clean old files). Config in `scripts/watchdog.config.json`
- **Security Agent**: `npm run security` — continuous security audit (blast radius, network exposure, browser control, disk hygiene, plugin hygiene, credentials, reverse proxy, session logs, shell injection, input validation, path traversal, secrets in git history). Config in `scripts/security.config.json`. `npm run security:once` for single scan with CI-friendly exit codes.
