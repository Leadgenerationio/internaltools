#!/usr/bin/env node
/**
 * Stress Test Agent — Simulates N concurrent users performing realistic flows.
 *
 * Run:    npm run stress-test
 * Config: scripts/stress-test.config.json
 *
 * Phases:
 *   1. Setup     — Generate fixtures, register & login N users
 *   2. Upload    — Each user uploads a video + music concurrently
 *   3. Render    — Each user renders with overlays, polls for completion
 *   4. Report    — Per-endpoint metrics table + summary
 *
 * Env vars:
 *   STRESS_BASE_URL     — Server URL (default: http://localhost:3000)
 *   STRESS_USERS        — Number of virtual users (default: 100)
 *   STRESS_CONCURRENCY  — Max concurrent requests (default: 20)
 *   STRESS_GENERATE_ADS — Set to "1" to include ad generation (costs API credits)
 *   STRESS_VERBOSE      — Set to "1" for detailed logging
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── Types ──────────────────────────────────────────────────────────────────

interface StressConfig {
  baseUrl: string;
  users: number;
  concurrency: number;
  scenarios: string[];
  enableGenerateAds: boolean;
  verbose: boolean;
}

interface VirtualUser {
  index: number;
  email: string;
  password: string;
  companyId: string;
  userId: string;
  authCookie: string;
  uploadedVideo: any | null;
  uploadedMusic: any | null;
  projectId: string;
}

interface Metric {
  endpoint: string;
  method: string;
  statusCode: number;
  durationMs: number;
  success: boolean;
  error?: string;
  userId?: number;
}

interface EndpointStats {
  endpoint: string;
  requests: number;
  successes: number;
  failures: number;
  errorRate: string;
  p50: string;
  p95: string;
  p99: string;
  mean: string;
  min: string;
  max: string;
}

// ─── Colors ─────────────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  boldRed: '\x1b[1;31m',
  boldGreen: '\x1b[1;32m',
  boldCyan: '\x1b[1;36m',
};

// ─── Paths ──────────────────────────────────────────────────────────────────

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const CONFIG_PATH = path.join(SCRIPT_DIR, 'stress-test.config.json');
const FIXTURES_DIR = path.join(SCRIPT_DIR, 'fixtures');

// ─── Config ─────────────────────────────────────────────────────────────────

function loadConfig(): StressConfig {
  let fileConfig: Partial<StressConfig> = {};
  if (fs.existsSync(CONFIG_PATH)) {
    fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  }

  const env = process.env;
  return {
    baseUrl: env.STRESS_BASE_URL || fileConfig.baseUrl || 'http://localhost:3000',
    users: Number(env.STRESS_USERS) || fileConfig.users || 100,
    concurrency: Number(env.STRESS_CONCURRENCY) || fileConfig.concurrency || 20,
    scenarios: fileConfig.scenarios || ['register', 'upload', 'render'],
    enableGenerateAds: env.STRESS_GENERATE_ADS === '1' || fileConfig.enableGenerateAds || false,
    verbose: env.STRESS_VERBOSE === '1' || fileConfig.verbose || false,
  };
}

// ─── Metrics ────────────────────────────────────────────────────────────────

const metrics: Metric[] = [];

function record(m: Metric): void {
  metrics.push(m);
}

/** Timed fetch that records metrics automatically. */
async function timedFetch(
  endpoint: string,
  method: string,
  url: string,
  init: RequestInit,
  userId?: number,
): Promise<Response> {
  const start = Date.now();
  let res: Response;
  try {
    res = await fetch(url, init);
    // 302 is expected for NextAuth login callbacks (redirect after success)
    const isSuccess = res.ok || (endpoint === 'login' && res.status === 302);
    record({
      endpoint,
      method,
      statusCode: res.status,
      durationMs: Date.now() - start,
      success: isSuccess,
      error: isSuccess ? undefined : `HTTP ${res.status}`,
      userId,
    });
    return res;
  } catch (err: any) {
    record({
      endpoint,
      method,
      statusCode: 0,
      durationMs: Date.now() - start,
      success: false,
      error: err.message,
      userId,
    });
    throw err;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`  ${c.dim}${msg}${c.reset}`);
}

function verbose(config: StressConfig, msg: string): void {
  if (config.verbose) console.log(`    ${c.gray}${msg}${c.reset}`);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/** Run items through fn with limited concurrency. */
async function runBatched<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIdx = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIdx < items.length) {
        const i = nextIdx++;
        await fn(items[i], i);
      }
    },
  );
  await Promise.allSettled(workers);
}

/** Progress bar for batch operations. */
function progressBar(current: number, total: number, label: string): void {
  const pct = Math.round((current / total) * 100);
  const barLen = 30;
  const filled = Math.round((current / total) * barLen);
  const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
  process.stdout.write(`\r  ${c.cyan}${bar}${c.reset} ${pct}% ${label} (${current}/${total})`);
  if (current === total) process.stdout.write('\n');
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

function ensureFixtures(): void {
  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }

  const videoPath = path.join(FIXTURES_DIR, 'test-video.mp4');
  const audioPath = path.join(FIXTURES_DIR, 'test-audio.mp3');

  if (!fs.existsSync(videoPath)) {
    log('Generating test video fixture...');
    execFileSync('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:d=2',
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono',
      '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      videoPath,
    ], { stdio: 'pipe' });
  }

  if (!fs.existsSync(audioPath)) {
    log('Generating test audio fixture...');
    execFileSync('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono',
      '-t', '3', '-c:a', 'libmp3lame', '-b:a', '64k',
      audioPath,
    ], { stdio: 'pipe' });
  }
}

// ─── Auth ───────────────────────────────────────────────────────────────────

async function registerUser(
  baseUrl: string,
  email: string,
  password: string,
  companyName: string,
): Promise<{ companyId: string; userId: string }> {
  const res = await timedFetch('register', 'POST', `${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyName, email, password, name: 'Stress Test User' }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Register failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return { companyId: data.companyId, userId: data.userId };
}

async function loginUser(baseUrl: string, email: string, password: string): Promise<string> {
  // Step 1: Get CSRF token
  const csrfRes = await fetch(`${baseUrl}/api/auth/csrf`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!csrfRes.ok) throw new Error(`CSRF fetch failed: HTTP ${csrfRes.status}`);

  const csrfCookies = csrfRes.headers.getSetCookie?.() || [];
  const { csrfToken } = await csrfRes.json();

  // Step 2: Login
  const cookieHeader = csrfCookies.map((ck: string) => ck.split(';')[0]).join('; ');
  const loginRes = await timedFetch('login', 'POST', `${baseUrl}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: new URLSearchParams({ csrfToken, email, password }),
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  });

  // Step 3: Check for login error
  const redirectUrl = loginRes.headers.get('location') || '';
  if (redirectUrl.includes('error=')) {
    throw new Error(`Login rejected — ${redirectUrl}`);
  }

  // Step 4: Collect cookies
  const loginCookies = loginRes.headers.getSetCookie?.() || [];
  const allCookies = [...csrfCookies, ...loginCookies]
    .map((ck: string) => ck.split(';')[0])
    .filter(Boolean);
  if (redirectUrl) {
    const followRes = await fetch(
      redirectUrl.startsWith('http') ? redirectUrl : `${baseUrl}${redirectUrl}`,
      {
        headers: { Cookie: allCookies.join('; ') },
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      },
    );
    const followCookies = followRes.headers.getSetCookie?.() || [];
    for (const ck of followCookies) {
      allCookies.push(ck.split(';')[0]);
    }
  }

  if (allCookies.length === 0) {
    throw new Error('No session cookies received');
  }

  return allCookies.join('; ');
}

/** Make an authenticated request. */
function af(url: string, init: RequestInit, user: VirtualUser): RequestInit {
  const existing = (init.headers || {}) as Record<string, string>;
  return {
    ...init,
    headers: { ...existing, Cookie: user.authCookie },
  };
}

// ─── Scenarios ──────────────────────────────────────────────────────────────

async function scenarioUploadVideo(
  config: StressConfig,
  user: VirtualUser,
): Promise<void> {
  const videoPath = path.join(FIXTURES_DIR, 'test-video.mp4');
  const buffer = fs.readFileSync(videoPath);
  const file = new File([buffer], `stress-${user.index}.mp4`, { type: 'video/mp4' });
  const form = new FormData();
  form.append('videos', file);

  const res = await timedFetch(
    'upload',
    'POST',
    `${config.baseUrl}/api/upload`,
    af(`${config.baseUrl}/api/upload`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(30000),
    }, user),
    user.index,
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  if (data.videos && data.videos.length > 0) {
    user.uploadedVideo = data.videos[0];
    verbose(config, `User ${user.index}: Uploaded video ${user.uploadedVideo.id}`);
  }
}

async function scenarioUploadMusic(
  config: StressConfig,
  user: VirtualUser,
): Promise<void> {
  const audioPath = path.join(FIXTURES_DIR, 'test-audio.mp3');
  const buffer = fs.readFileSync(audioPath);
  const file = new File([buffer], `stress-music-${user.index}.mp3`, { type: 'audio/mpeg' });
  const form = new FormData();
  form.append('music', file);

  const res = await timedFetch(
    'upload-music',
    'POST',
    `${config.baseUrl}/api/upload-music`,
    af(`${config.baseUrl}/api/upload-music`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(15000),
    }, user),
    user.index,
  );

  if (!res.ok) return; // Music is optional

  const data = await res.json();
  user.uploadedMusic = data;
  verbose(config, `User ${user.index}: Uploaded music ${data.id}`);
}

async function scenarioCreateProject(
  config: StressConfig,
  user: VirtualUser,
): Promise<void> {
  const res = await timedFetch(
    'projects',
    'POST',
    `${config.baseUrl}/api/projects`,
    af(`${config.baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Stress Test Project ${user.index}`,
        brief: {
          productService: 'Stress Test Product',
          targetAudience: 'Developers',
          sellingPoints: 'Fast and reliable',
          toneStyle: 'Professional',
        },
      }),
      signal: AbortSignal.timeout(10000),
    }, user),
    user.index,
  );

  if (!res.ok) return;
  const data = await res.json();
  user.projectId = data.project?.id || '';
  verbose(config, `User ${user.index}: Created project ${user.projectId}`);
}

async function scenarioGenerateAds(
  config: StressConfig,
  user: VirtualUser,
): Promise<void> {
  const res = await timedFetch(
    'generate-ads',
    'POST',
    `${config.baseUrl}/api/generate-ads`,
    af(`${config.baseUrl}/api/generate-ads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brief: {
          productService: 'Stress Test Product',
          targetAudience: 'Developers',
          sellingPoints: 'Fast and reliable',
          toneStyle: 'Professional',
          additionalContext: `Stress test user ${user.index}`,
        },
      }),
      signal: AbortSignal.timeout(60000),
    }, user),
    user.index,
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    verbose(config, `User ${user.index}: Generate ads failed (${res.status}): ${text}`);
    return;
  }

  const data = await res.json();
  verbose(config, `User ${user.index}: Generated ${data.ads?.length || 0} ads`);
}

async function scenarioRender(
  config: StressConfig,
  user: VirtualUser,
): Promise<void> {
  if (!user.uploadedVideo) {
    verbose(config, `User ${user.index}: Skipping render (no video uploaded)`);
    return;
  }

  const overlays = [
    {
      id: `overlay-${user.index}`,
      text: `Stress Test ${user.index}`,
      startTime: 0,
      endTime: user.uploadedVideo.duration || 2,
      position: 'center',
      yOffset: 0,
      style: {
        fontSize: 24,
        fontWeight: 'bold',
        textColor: '#ffffff',
        bgColor: '#000000',
        bgOpacity: 0.8,
        borderRadius: 8,
        paddingX: 16,
        paddingY: 12,
        maxWidth: 90,
        textAlign: 'center',
      },
    },
  ];

  const renderBody: any = {
    items: [
      {
        video: user.uploadedVideo,
        overlays,
        adLabel: `Stress Ad ${user.index}`,
      },
    ],
    quality: 'draft',
  };

  if (user.uploadedMusic) {
    renderBody.music = {
      id: user.uploadedMusic.id,
      name: user.uploadedMusic.name,
      file: user.uploadedMusic.path,
      volume: 0.5,
      startTime: 0,
      fadeIn: 0.5,
      fadeOut: 0.5,
    };
  }

  const res = await timedFetch(
    'render',
    'POST',
    `${config.baseUrl}/api/render`,
    af(`${config.baseUrl}/api/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(renderBody),
      signal: AbortSignal.timeout(60000),
    }, user),
    user.index,
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    verbose(config, `User ${user.index}: Render failed (${res.status}): ${text}`);
    return;
  }

  const data = await res.json();

  // If we got a jobId, poll for completion
  if (data.jobId) {
    verbose(config, `User ${user.index}: Render queued as job ${data.jobId}`);
    await pollJob(config, user, data.jobId, data.type || 'render');
  } else {
    verbose(config, `User ${user.index}: Render completed synchronously`);
  }
}

async function pollJob(
  config: StressConfig,
  user: VirtualUser,
  jobId: string,
  type: string,
): Promise<void> {
  const maxPollMs = 5 * 60 * 1000;
  const startTime = Date.now();
  let interval = 3000;

  while (Date.now() - startTime < maxPollMs) {
    await new Promise((r) => setTimeout(r, interval));
    interval = Math.min(interval * 1.5, 15000); // Exponential backoff

    const res = await timedFetch(
      'poll-job',
      'GET',
      `${config.baseUrl}/api/jobs/${jobId}?type=${type}`,
      af(`${config.baseUrl}/api/jobs/${jobId}?type=${type}`, {
        signal: AbortSignal.timeout(10000),
      }, user),
      user.index,
    );

    if (!res.ok) continue;

    const data = await res.json();
    if (data.state === 'completed') {
      verbose(config, `User ${user.index}: Job ${jobId} completed`);
      return;
    }
    if (data.state === 'failed') {
      verbose(config, `User ${user.index}: Job ${jobId} failed: ${data.error}`);
      return;
    }
  }

  verbose(config, `User ${user.index}: Job ${jobId} polling timed out`);
}

// ─── Report ─────────────────────────────────────────────────────────────────

function generateReport(config: StressConfig, totalDurationMs: number): void {
  console.log('');
  console.log(`${c.bold}${'═'.repeat(90)}${c.reset}`);
  console.log(`${c.bold}  STRESS TEST RESULTS${c.reset}`);
  console.log(`${c.bold}${'═'.repeat(90)}${c.reset}`);
  console.log('');

  // Group by endpoint
  const byEndpoint = new Map<string, Metric[]>();
  for (const m of metrics) {
    const key = `${m.method} ${m.endpoint}`;
    if (!byEndpoint.has(key)) byEndpoint.set(key, []);
    byEndpoint.get(key)!.push(m);
  }

  // Calculate stats per endpoint
  const stats: EndpointStats[] = [];
  for (const [endpoint, endpointMetrics] of byEndpoint) {
    const durations = endpointMetrics.map((m) => m.durationMs).sort((a, b) => a - b);
    const successes = endpointMetrics.filter((m) => m.success).length;
    const failures = endpointMetrics.length - successes;

    stats.push({
      endpoint,
      requests: endpointMetrics.length,
      successes,
      failures,
      errorRate: `${((failures / endpointMetrics.length) * 100).toFixed(1)}%`,
      p50: `${percentile(durations, 50)}ms`,
      p95: `${percentile(durations, 95)}ms`,
      p99: `${percentile(durations, 99)}ms`,
      mean: `${Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)}ms`,
      min: `${durations[0]}ms`,
      max: `${durations[durations.length - 1]}ms`,
    });
  }

  // Print table header
  const cols = [
    { key: 'endpoint', label: 'Endpoint', width: 28 },
    { key: 'requests', label: 'Reqs', width: 6 },
    { key: 'successes', label: 'OK', width: 6 },
    { key: 'failures', label: 'Fail', width: 6 },
    { key: 'errorRate', label: 'Err%', width: 7 },
    { key: 'p50', label: 'p50', width: 9 },
    { key: 'p95', label: 'p95', width: 9 },
    { key: 'p99', label: 'p99', width: 9 },
    { key: 'mean', label: 'Mean', width: 9 },
  ];

  const header = cols.map((col) => col.label.padEnd(col.width)).join(' ');
  console.log(`  ${c.bold}${header}${c.reset}`);
  console.log(`  ${c.dim}${'─'.repeat(header.length)}${c.reset}`);

  for (const s of stats) {
    const row = cols
      .map((col) => {
        const val = String((s as any)[col.key]);
        return val.padEnd(col.width);
      })
      .join(' ');

    const color = s.failures > 0 ? c.yellow : c.green;
    console.log(`  ${color}${row}${c.reset}`);
  }

  // Overall summary
  const totalRequests = metrics.length;
  const totalSuccesses = metrics.filter((m) => m.success).length;
  const totalFailures = totalRequests - totalSuccesses;
  const allDurations = metrics.map((m) => m.durationMs).sort((a, b) => a - b);
  const rateLimited = metrics.filter((m) => m.statusCode === 429).length;

  console.log('');
  console.log(`  ${c.bold}SUMMARY${c.reset}`);
  console.log(`  ${c.dim}${'─'.repeat(50)}${c.reset}`);
  console.log(`  Users:          ${config.users}`);
  console.log(`  Concurrency:    ${config.concurrency}`);
  console.log(`  Duration:       ${(totalDurationMs / 1000).toFixed(1)}s`);
  console.log(`  Total requests: ${totalRequests}`);
  console.log(`  Throughput:     ${(totalRequests / (totalDurationMs / 1000)).toFixed(1)} req/s`);
  console.log(
    `  Success rate:   ${totalSuccesses}/${totalRequests} (${((totalSuccesses / totalRequests) * 100).toFixed(1)}%)`,
  );

  if (totalFailures > 0) {
    console.log(`  ${c.boldRed}Failures:       ${totalFailures}${c.reset}`);
  }
  if (rateLimited > 0) {
    console.log(`  ${c.yellow}Rate limited:   ${rateLimited}${c.reset}`);
  }

  if (allDurations.length > 0) {
    console.log(`  p50 latency:    ${percentile(allDurations, 50)}ms`);
    console.log(`  p95 latency:    ${percentile(allDurations, 95)}ms`);
    console.log(`  p99 latency:    ${percentile(allDurations, 99)}ms`);
  }

  // Error breakdown
  const errors = metrics.filter((m) => !m.success && m.error);
  if (errors.length > 0) {
    const errorCounts = new Map<string, number>();
    for (const e of errors) {
      const key = e.error || 'Unknown';
      errorCounts.set(key, (errorCounts.get(key) || 0) + 1);
    }

    console.log('');
    console.log(`  ${c.bold}ERROR BREAKDOWN${c.reset}`);
    console.log(`  ${c.dim}${'─'.repeat(50)}${c.reset}`);
    const sorted = [...errorCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [err, count] of sorted.slice(0, 10)) {
      console.log(`  ${c.red}${count}x${c.reset} ${err}`);
    }
  }

  console.log('');
  console.log(`${c.bold}${'═'.repeat(90)}${c.reset}`);

  // Exit with error code if failure rate > 10%
  if (totalFailures / totalRequests > 0.1) {
    console.log(`\n  ${c.boldRed}STRESS TEST FAILED — error rate above 10%${c.reset}\n`);
    process.exitCode = 1;
  } else {
    console.log(`\n  ${c.boldGreen}STRESS TEST PASSED${c.reset}\n`);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(
    `${c.bold}${c.cyan}╔══════════════════════════════════════════════════════════╗${c.reset}`,
  );
  console.log(
    `${c.bold}${c.cyan}║          STRESS TEST AGENT — Ad Video Creator           ║${c.reset}`,
  );
  console.log(
    `${c.bold}${c.cyan}╚══════════════════════════════════════════════════════════╝${c.reset}`,
  );

  const config = loadConfig();
  console.log(`${c.dim}  Base URL:      ${config.baseUrl}${c.reset}`);
  console.log(`${c.dim}  Users:         ${config.users}${c.reset}`);
  console.log(`${c.dim}  Concurrency:   ${config.concurrency}${c.reset}`);
  console.log(`${c.dim}  Scenarios:     ${config.scenarios.join(', ')}${c.reset}`);
  console.log(`${c.dim}  Generate ads:  ${config.enableGenerateAds}${c.reset}`);
  console.log('');

  const overallStart = Date.now();

  // Check server is up
  try {
    const res = await fetch(config.baseUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    log('Server is up');
  } catch (err: any) {
    console.error(`${c.boldRed}  Server not responding at ${config.baseUrl}: ${err.message}${c.reset}`);
    process.exit(1);
  }

  // Generate fixtures
  ensureFixtures();
  log('Fixtures ready');
  console.log('');

  // ─── Phase 1: Register & Login Users ──────────────────────────────

  console.log(`${c.bold}  PHASE 1: Register & Login ${config.users} users${c.reset}`);
  const runId = Date.now().toString(36);
  const users: VirtualUser[] = [];
  let registered = 0;
  let loginCount = 0;

  // Register users (batched to avoid overwhelming)
  await runBatched(
    Array.from({ length: config.users }, (_, i) => i),
    Math.min(config.concurrency, 10), // Cap registration concurrency
    async (_, i) => {
      const email = `stress-${runId}-${String(i).padStart(4, '0')}@test.local`;
      const password = `StressTest${runId}!${i}`;
      const companyName = `Stress Test Co ${i}`;

      try {
        const { companyId, userId } = await registerUser(config.baseUrl, email, password, companyName);
        users.push({
          index: i,
          email,
          password,
          companyId,
          userId,
          authCookie: '',
          uploadedVideo: null,
          uploadedMusic: null,
          projectId: '',
        });
        registered++;
      } catch (err: any) {
        verbose(config, `Register user ${i} failed: ${err.message}`);
      }
      progressBar(registered, config.users, 'registered');
    },
  );

  if (users.length === 0) {
    console.error(`${c.boldRed}  No users registered. Aborting.${c.reset}`);
    process.exit(1);
  }
  log(`${users.length}/${config.users} users registered`);

  // Login users (batched)
  await runBatched(users, config.concurrency, async (user) => {
    try {
      user.authCookie = await loginUser(config.baseUrl, user.email, user.password);
      loginCount++;
    } catch (err: any) {
      verbose(config, `Login user ${user.index} failed: ${err.message}`);
    }
    progressBar(loginCount, users.length, 'logged in');
  });

  const authedUsers = users.filter((u) => u.authCookie);
  log(`${authedUsers.length}/${users.length} users authenticated`);
  console.log('');

  if (authedUsers.length === 0) {
    console.error(`${c.boldRed}  No users authenticated. Aborting.${c.reset}`);
    process.exit(1);
  }

  // ─── Phase 2: Upload Phase ───────────────────────────────────────

  if (config.scenarios.includes('upload')) {
    console.log(`${c.bold}  PHASE 2: Upload videos & music (${authedUsers.length} users)${c.reset}`);
    let uploadCount = 0;

    await runBatched(authedUsers, config.concurrency, async (user) => {
      try {
        await scenarioUploadVideo(config, user);
      } catch (err: any) {
        verbose(config, `User ${user.index} upload failed: ${err.message}`);
      }

      // Upload music for ~30% of users
      if (user.index % 3 === 0) {
        try {
          await scenarioUploadMusic(config, user);
        } catch (err: any) {
          verbose(config, `User ${user.index} music upload failed: ${err.message}`);
        }
      }

      uploadCount++;
      progressBar(uploadCount, authedUsers.length, 'uploaded');
    });

    const withVideo = authedUsers.filter((u) => u.uploadedVideo).length;
    const withMusic = authedUsers.filter((u) => u.uploadedMusic).length;
    log(`${withVideo} videos, ${withMusic} music files uploaded`);
    console.log('');
  }

  // ─── Phase 3: Create Projects + Generate Ads ─────────────────────

  if (config.scenarios.includes('register')) {
    console.log(`${c.bold}  PHASE 3: Create projects${config.enableGenerateAds ? ' + generate ads' : ''} (${authedUsers.length} users)${c.reset}`);
    let projectCount = 0;

    await runBatched(authedUsers, config.concurrency, async (user) => {
      try {
        await scenarioCreateProject(config, user);
      } catch (err: any) {
        verbose(config, `User ${user.index} project creation failed: ${err.message}`);
      }

      if (config.enableGenerateAds) {
        try {
          await scenarioGenerateAds(config, user);
        } catch (err: any) {
          verbose(config, `User ${user.index} ad gen failed: ${err.message}`);
        }
      }

      projectCount++;
      progressBar(projectCount, authedUsers.length, 'projects created');
    });

    const withProject = authedUsers.filter((u) => u.projectId).length;
    log(`${withProject} projects created`);
    console.log('');
  }

  // ─── Phase 4: Render Phase ──────────────────────────────────────

  if (config.scenarios.includes('render')) {
    const usersWithVideos = authedUsers.filter((u) => u.uploadedVideo);
    console.log(`${c.bold}  PHASE 4: Render (${usersWithVideos.length} users with videos)${c.reset}`);
    let renderCount = 0;

    if (usersWithVideos.length > 0) {
      await runBatched(usersWithVideos, config.concurrency, async (user) => {
        try {
          await scenarioRender(config, user);
        } catch (err: any) {
          verbose(config, `User ${user.index} render failed: ${err.message}`);
        }
        renderCount++;
        progressBar(renderCount, usersWithVideos.length, 'renders');
      });
    } else {
      log('No users have uploaded videos — skipping renders');
    }
    console.log('');
  }

  // ─── Report ──────────────────────────────────────────────────────

  const totalDuration = Date.now() - overallStart;
  generateReport(config, totalDuration);
}

// ─── Entry ──────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error(`${c.boldRed}Fatal error: ${err.message}${c.reset}`);
  process.exit(1);
});
