#!/usr/bin/env node
/**
 * Watchdog QA Agent — continuous health/test/stress monitor for Ad Video Creator
 *
 * Run:    npm run watchdog
 * Config: scripts/watchdog.config.json (all fields overridable via WATCHDOG_* env vars)
 */

import { execSync, execFileSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Config {
  baseUrl: string;
  intervalSeconds: number;
  port: number;
  enableGenerateAds: boolean;
  enableGenerateVideo: boolean;
  maxFileAgeHours: number;
  maxConcurrentStress: number;
  autoRestart: boolean;
  autoCleanup: boolean;
  autoCreateDirs: boolean;
  verbose: boolean;
}

type TestStatus = 'pass' | 'fail' | 'warn' | 'skip';
type TestCategory = 'health' | 'api' | 'stress' | 'filesystem' | 'remediation';

interface TestResult {
  id: string;
  name: string;
  category: TestCategory;
  status: TestStatus;
  durationMs: number;
  error?: string;
  detail?: string;
}

interface CycleReport {
  cycle: number;
  timestamp: string;
  results: TestResult[];
  remediations: string[];
  summary: { passed: number; failed: number; warned: number; skipped: number };
  config: Config;
}

interface ReportFile {
  lastCycle: CycleReport;
  history: CycleReport[];
}

interface CycleContext {
  serverUp: boolean;
  uploadedVideo: any | null;
  uploadedMusic: any | null;
  renderOutput: any | null;
  artifactPaths: string[];
  remediations: string[];
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
};

function tag(status: TestStatus): string {
  switch (status) {
    case 'pass': return `${c.green}[PASS]${c.reset}`;
    case 'fail': return `${c.boldRed}[FAIL]${c.reset}`;
    case 'warn': return `${c.yellow}[WARN]${c.reset}`;
    case 'skip': return `${c.gray}[SKIP]${c.reset}`;
  }
}

function fixTag(): string {
  return `${c.cyan}[FIX] ${c.reset}`;
}

// ─── Paths ──────────────────────────────────────────────────────────────────

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const CONFIG_PATH = path.join(SCRIPT_DIR, 'watchdog.config.json');
const REPORT_PATH = path.join(PROJECT_ROOT, 'watchdog-report.json');
const FIXTURES_DIR = path.join(SCRIPT_DIR, 'fixtures');

// ─── Config ─────────────────────────────────────────────────────────────────

function loadConfig(): Config {
  let fileConfig: Partial<Config> = {};
  if (fs.existsSync(CONFIG_PATH)) {
    fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  }

  const env = process.env;
  return {
    baseUrl: env.WATCHDOG_BASE_URL || fileConfig.baseUrl || 'http://localhost:3000',
    intervalSeconds: Number(env.WATCHDOG_INTERVAL) || fileConfig.intervalSeconds || 45,
    port: Number(env.WATCHDOG_PORT) || fileConfig.port || 3000,
    enableGenerateAds: env.WATCHDOG_GENERATE_ADS === '1' || fileConfig.enableGenerateAds || false,
    enableGenerateVideo: env.WATCHDOG_GENERATE_VIDEO === '1' || fileConfig.enableGenerateVideo || false,
    maxFileAgeHours: Number(env.WATCHDOG_MAX_FILE_AGE) || fileConfig.maxFileAgeHours || 24,
    maxConcurrentStress: Number(env.WATCHDOG_CONCURRENT) || fileConfig.maxConcurrentStress || 5,
    autoRestart: env.WATCHDOG_AUTO_RESTART !== '0' && (fileConfig.autoRestart ?? true),
    autoCleanup: env.WATCHDOG_AUTO_CLEANUP !== '0' && (fileConfig.autoCleanup ?? true),
    autoCreateDirs: env.WATCHDOG_AUTO_CREATE_DIRS !== '0' && (fileConfig.autoCreateDirs ?? true),
    verbose: env.WATCHDOG_VERBOSE === '1' || fileConfig.verbose || false,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseEnvFile(filePath: string): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return vars;

  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

function assertShape(obj: any, schema: Record<string, string>): string | null {
  if (!obj || typeof obj !== 'object') return 'Expected an object';
  for (const [key, expectedType] of Object.entries(schema)) {
    if (!(key in obj)) return `Missing field: ${key}`;
    if (expectedType === 'array') {
      if (!Array.isArray(obj[key])) return `Field "${key}" should be an array`;
    } else if (typeof obj[key] !== expectedType) {
      return `Field "${key}" should be ${expectedType}, got ${typeof obj[key]}`;
    }
  }
  return null;
}

function formatMs(ms: number): string {
  if (ms < 0) return '--';
  return `${ms}ms`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

// ─── Fixture Generation ─────────────────────────────────────────────────────

function ensureFixtures(): void {
  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }

  const videoPath = path.join(FIXTURES_DIR, 'test-video.mp4');
  const audioPath = path.join(FIXTURES_DIR, 'test-audio.mp3');

  if (!fs.existsSync(videoPath)) {
    console.log(`${c.dim}  Generating test video fixture...${c.reset}`);
    execSync(
      `ffmpeg -y -f lavfi -i color=c=black:s=320x240:d=2 -f lavfi -i anullsrc=r=44100:cl=mono -shortest -c:v libx264 -pix_fmt yuv420p -c:a aac "${videoPath}"`,
      { stdio: 'pipe' },
    );
  }

  if (!fs.existsSync(audioPath)) {
    console.log(`${c.dim}  Generating test audio fixture...${c.reset}`);
    execSync(
      `ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=mono -t 3 -c:a libmp3lame -b:a 64k "${audioPath}"`,
      { stdio: 'pipe' },
    );
  }
}

// ─── Test Runner ────────────────────────────────────────────────────────────

async function runTest(
  id: string,
  name: string,
  category: TestCategory,
  fn: (ctx: CycleContext) => Promise<{ status: TestStatus; error?: string; detail?: string }>,
  ctx: CycleContext,
): Promise<TestResult> {
  const start = Date.now();
  try {
    const result = await fn(ctx);
    return { id, name, category, ...result, durationMs: Date.now() - start };
  } catch (err: any) {
    return {
      id,
      name,
      category,
      status: 'fail',
      error: err.message || String(err),
      durationMs: Date.now() - start,
    };
  }
}

// ─── Phase 1: Health Checks ─────────────────────────────────────────────────

async function runHealthChecks(config: Config, ctx: CycleContext): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Server responding
  results.push(
    await runTest(
      'health.server',
      `Dev server responding on :${config.port}`,
      'health',
      async () => {
        try {
          const res = await fetch(config.baseUrl, {
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) {
            ctx.serverUp = true;
            return { status: 'pass' };
          }
          return { status: 'fail', error: `HTTP ${res.status}` };
        } catch (err: any) {
          return { status: 'fail', error: err.message };
        }
      },
      ctx,
    ),
  );

  // Required directories
  const dirs = ['public/uploads', 'public/outputs', 'public/music', 'logs'];
  for (const dir of dirs) {
    const fullPath = path.join(PROJECT_ROOT, dir);
    results.push(
      await runTest(
        `health.dir.${dir}`,
        `${dir}/ exists`,
        'health',
        async () => {
          return fs.existsSync(fullPath)
            ? { status: 'pass' }
            : { status: 'fail', error: 'Directory missing' };
        },
        ctx,
      ),
    );
  }

  // FFmpeg
  results.push(
    await runTest(
      'health.ffmpeg',
      'FFmpeg available',
      'health',
      async () => {
        try {
          execSync('ffmpeg -version', { stdio: 'pipe' });
          return { status: 'pass' };
        } catch {
          return { status: 'fail', error: 'ffmpeg not found in PATH' };
        }
      },
      ctx,
    ),
  );

  // FFprobe
  results.push(
    await runTest(
      'health.ffprobe',
      'FFprobe available',
      'health',
      async () => {
        try {
          execSync('ffprobe -version', { stdio: 'pipe' });
          return { status: 'pass' };
        } catch {
          return { status: 'fail', error: 'ffprobe not found in PATH' };
        }
      },
      ctx,
    ),
  );

  // Env vars
  const envFile = path.join(PROJECT_ROOT, '.env.local');
  const envVars = parseEnvFile(envFile);
  const envChecks = [
    { key: 'ANTHROPIC_API_KEY', label: 'ANTHROPIC_API_KEY' },
    { key: 'GEMINI_API_KEY', label: 'GEMINI_API_KEY' },
  ];

  for (const check of envChecks) {
    results.push(
      await runTest(
        `health.env.${check.key}`,
        `${check.label} is set`,
        'health',
        async () => {
          const val = envVars[check.key] || process.env[check.key];
          if (val && val.length > 0) return { status: 'pass' };
          return { status: 'warn', error: `${check.label} is not set` };
        },
        ctx,
      ),
    );
  }

  return results;
}

// ─── Phase 2: API Functional Tests ──────────────────────────────────────────

async function runApiTests(
  config: Config,
  ctx: CycleContext,
): Promise<TestResult[]> {
  if (!ctx.serverUp) {
    return [
      {
        id: 'api.skipped',
        name: 'API tests skipped (server down)',
        category: 'api',
        status: 'skip',
        durationMs: 0,
      },
    ];
  }

  const results: TestResult[] = [];
  const base = config.baseUrl;

  // GET /api/logs
  results.push(
    await runTest(
      'api.logs.get',
      'GET /api/logs — valid shape',
      'api',
      async () => {
        const res = await fetch(`${base}/api/logs`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return { status: 'fail', error: `HTTP ${res.status}` };
        const data = await res.json();
        const err = assertShape(data, { logs: 'array' });
        if (err) return { status: 'fail', error: err };
        return { status: 'pass' };
      },
      ctx,
    ),
  );

  // POST /api/log — valid
  results.push(
    await runTest(
      'api.log.valid',
      'POST /api/log — valid entry',
      'api',
      async () => {
        const res = await fetch(`${base}/api/log`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            level: 'info',
            message: 'watchdog test log',
            source: 'watchdog',
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return { status: 'fail', error: `HTTP ${res.status}` };
        const data = await res.json();
        if (!data.ok) return { status: 'fail', error: 'Expected { ok: true }' };
        return { status: 'pass' };
      },
      ctx,
    ),
  );

  // POST /api/log — invalid body
  results.push(
    await runTest(
      'api.log.invalid',
      'POST /api/log — invalid body returns error',
      'api',
      async () => {
        const res = await fetch(`${base}/api/log`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'not json{{{',
          signal: AbortSignal.timeout(10000),
        });
        if (res.status >= 400) return { status: 'pass' };
        return {
          status: 'warn',
          error: `Expected error status, got ${res.status}`,
        };
      },
      ctx,
    ),
  );

  // POST /api/upload — valid video
  results.push(
    await runTest(
      'api.upload.valid',
      'POST /api/upload — valid video',
      'api',
      async () => {
        const videoPath = path.join(FIXTURES_DIR, 'test-video.mp4');
        if (!fs.existsSync(videoPath))
          return { status: 'skip', error: 'Test fixture missing' };

        const buffer = fs.readFileSync(videoPath);
        const file = new File([buffer], 'watchdog-test.mp4', {
          type: 'video/mp4',
        });
        const form = new FormData();
        form.append('videos', file);

        const res = await fetch(`${base}/api/upload`, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(30000),
        });
        if (!res.ok)
          return {
            status: 'fail',
            error: `HTTP ${res.status}: ${await res.text()}`,
          };

        const data = await res.json();
        const err = assertShape(data, { videos: 'array' });
        if (err) return { status: 'fail', error: err };
        if (data.videos.length === 0)
          return { status: 'fail', error: 'Empty videos array' };

        const video = data.videos[0];
        const shapeErr = assertShape(video, {
          id: 'string',
          filename: 'string',
          path: 'string',
          duration: 'number',
          width: 'number',
          height: 'number',
        });
        if (shapeErr) return { status: 'fail', error: shapeErr };

        ctx.uploadedVideo = video;

        // Track artifacts for cleanup
        const absPath = path.join(
          PROJECT_ROOT,
          'public',
          video.path.startsWith('/') ? video.path.slice(1) : video.path,
        );
        ctx.artifactPaths.push(absPath);
        if (video.thumbnail) {
          const thumbAbs = path.join(
            PROJECT_ROOT,
            'public',
            video.thumbnail.startsWith('/')
              ? video.thumbnail.slice(1)
              : video.thumbnail,
          );
          ctx.artifactPaths.push(thumbAbs);
        }

        return { status: 'pass' };
      },
      ctx,
    ),
  );

  // POST /api/upload — empty FormData
  results.push(
    await runTest(
      'api.upload.empty',
      'POST /api/upload — empty FormData returns 400',
      'api',
      async () => {
        const form = new FormData();
        const res = await fetch(`${base}/api/upload`, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(10000),
        });
        if (res.status === 400) return { status: 'pass' };
        return {
          status: 'fail',
          error: `Expected 400, got ${res.status}`,
        };
      },
      ctx,
    ),
  );

  // POST /api/upload-music — valid
  results.push(
    await runTest(
      'api.music.valid',
      'POST /api/upload-music — valid audio',
      'api',
      async () => {
        const audioPath = path.join(FIXTURES_DIR, 'test-audio.mp3');
        if (!fs.existsSync(audioPath))
          return { status: 'skip', error: 'Test fixture missing' };

        const buffer = fs.readFileSync(audioPath);
        const file = new File([buffer], 'watchdog-test.mp3', {
          type: 'audio/mpeg',
        });
        const form = new FormData();
        form.append('music', file);

        const res = await fetch(`${base}/api/upload-music`, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok)
          return {
            status: 'fail',
            error: `HTTP ${res.status}: ${await res.text()}`,
          };

        const data = await res.json();
        const err = assertShape(data, {
          id: 'string',
          name: 'string',
          path: 'string',
        });
        if (err) return { status: 'fail', error: err };

        ctx.uploadedMusic = data;
        const absPath = path.join(
          PROJECT_ROOT,
          'public',
          data.path.startsWith('/') ? data.path.slice(1) : data.path,
        );
        ctx.artifactPaths.push(absPath);

        return { status: 'pass' };
      },
      ctx,
    ),
  );

  // POST /api/upload-music — bad extension
  results.push(
    await runTest(
      'api.music.badext',
      'POST /api/upload-music — .exe returns 400',
      'api',
      async () => {
        const file = new File([new Uint8Array(100)], 'malware.exe', {
          type: 'application/octet-stream',
        });
        const form = new FormData();
        form.append('music', file);

        const res = await fetch(`${base}/api/upload-music`, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(10000),
        });
        if (res.status === 400) return { status: 'pass' };
        return {
          status: 'fail',
          error: `Expected 400, got ${res.status}`,
        };
      },
      ctx,
    ),
  );

  // POST /api/render — valid render (depends on uploaded video)
  results.push(
    await runTest(
      'api.render.valid',
      'POST /api/render — valid render',
      'api',
      async () => {
        if (!ctx.uploadedVideo)
          return { status: 'skip', error: 'Dependency failed: upload test' };

        const overlays = [
          {
            id: 'test-overlay-1',
            text: 'Watchdog Test',
            startTime: 0,
            endTime: ctx.uploadedVideo.duration || 2,
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

        const musicConfig = ctx.uploadedMusic
          ? {
              id: ctx.uploadedMusic.id,
              name: ctx.uploadedMusic.name,
              file: ctx.uploadedMusic.path,
              volume: 0.5,
              startTime: 0,
              fadeIn: 0.5,
              fadeOut: 0.5,
            }
          : null;

        const res = await fetch(`${base}/api/render`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videos: [ctx.uploadedVideo],
            overlays,
            music: musicConfig,
          }),
          signal: AbortSignal.timeout(60000),
        });

        if (!res.ok) {
          const text = await res.text();
          return { status: 'fail', error: `HTTP ${res.status}: ${text}` };
        }

        const data = await res.json();
        const err = assertShape(data, { results: 'array' });
        if (err) return { status: 'fail', error: err };

        ctx.renderOutput = data;

        // Track render outputs for cleanup
        for (const r of data.results) {
          if (r.outputUrl) {
            const absPath = path.join(
              PROJECT_ROOT,
              'public',
              r.outputUrl.startsWith('/')
                ? r.outputUrl.slice(1)
                : r.outputUrl,
            );
            ctx.artifactPaths.push(absPath);
          }
        }

        return { status: 'pass' };
      },
      ctx,
    ),
  );

  // POST /api/render — no videos
  results.push(
    await runTest(
      'api.render.novideos',
      'POST /api/render — no videos returns 400',
      'api',
      async () => {
        const res = await fetch(`${base}/api/render`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videos: [],
            overlays: [{ id: 'x', text: 'test' }],
            music: null,
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (res.status === 400) return { status: 'pass' };
        return {
          status: 'fail',
          error: `Expected 400, got ${res.status}`,
        };
      },
      ctx,
    ),
  );

  // POST /api/render — no overlays
  results.push(
    await runTest(
      'api.render.nooverlays',
      'POST /api/render — no overlays returns 400',
      'api',
      async () => {
        const res = await fetch(`${base}/api/render`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videos: [{ id: 'x', path: 'uploads/fake.mp4' }],
            overlays: [],
            music: null,
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (res.status === 400) return { status: 'pass' };
        return {
          status: 'fail',
          error: `Expected 400, got ${res.status}`,
        };
      },
      ctx,
    ),
  );

  // POST /api/render — path traversal
  results.push(
    await runTest(
      'api.render.traversal',
      'POST /api/render — path traversal blocked',
      'api',
      async () => {
        const res = await fetch(`${base}/api/render`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videos: [
              {
                id: 'x',
                path: '/../../../etc/passwd',
                width: 320,
                height: 240,
                duration: 2,
                filename: 'test',
                originalName: 'test',
              },
            ],
            overlays: [
              {
                id: 'o',
                text: 'test',
                startTime: 0,
                endTime: 1,
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
            ],
            music: null,
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (res.status === 400) return { status: 'pass' };
        return {
          status: 'fail',
          error: `Expected 400, got ${res.status}`,
        };
      },
      ctx,
    ),
  );

  // Optional: generate-ads
  results.push(
    await runTest(
      'api.generateads',
      'POST /api/generate-ads',
      'api',
      async () => {
        if (!config.enableGenerateAds)
          return { status: 'skip', error: 'Disabled in config' };

        const res = await fetch(`${base}/api/generate-ads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brief: {
              productService: 'Watchdog QA Test Product',
              targetAudience: 'Developers',
              sellingPoints: 'Fast, reliable',
              adExamples: '',
              toneStyle: 'Professional',
              additionalContext:
                'This is a test request from the watchdog agent',
            },
          }),
          signal: AbortSignal.timeout(60000),
        });
        if (!res.ok)
          return {
            status: 'fail',
            error: `HTTP ${res.status}: ${await res.text()}`,
          };
        const data = await res.json();
        const err = assertShape(data, { ads: 'array' });
        if (err) return { status: 'fail', error: err };
        return { status: 'pass', detail: `Generated ${data.ads.length} ads` };
      },
      ctx,
    ),
  );

  // Optional: generate-video
  results.push(
    await runTest(
      'api.generatevideo',
      'POST /api/generate-video',
      'api',
      async () => {
        if (!config.enableGenerateVideo)
          return { status: 'skip', error: 'Disabled in config' };

        const res = await fetch(`${base}/api/generate-video`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: 'A simple black screen for testing purposes',
            count: 1,
            aspectRatio: '9:16',
            duration: '4',
          }),
          signal: AbortSignal.timeout(300000),
        });
        if (!res.ok)
          return {
            status: 'fail',
            error: `HTTP ${res.status}: ${await res.text()}`,
          };
        const data = await res.json();
        const err = assertShape(data, { videos: 'array' });
        if (err) return { status: 'fail', error: err };
        return {
          status: 'pass',
          detail: `Generated ${data.videos.length} videos`,
        };
      },
      ctx,
    ),
  );

  return results;
}

// ─── Phase 3: Stress Tests ──────────────────────────────────────────────────

async function runStressTests(
  config: Config,
  ctx: CycleContext,
): Promise<TestResult[]> {
  if (!ctx.serverUp) {
    return [
      {
        id: 'stress.skipped',
        name: 'Stress tests skipped (server down)',
        category: 'stress',
        status: 'skip',
        durationMs: 0,
      },
    ];
  }

  const results: TestResult[] = [];
  const base = config.baseUrl;
  const n = config.maxConcurrentStress;

  // Concurrent GET /api/logs
  results.push(
    await runTest(
      'stress.logs.concurrent',
      `${n}x concurrent GET /api/logs`,
      'stress',
      async () => {
        const promises = Array.from({ length: n }, () =>
          fetch(`${base}/api/logs`, { signal: AbortSignal.timeout(15000) }),
        );
        const settled = await Promise.allSettled(promises);
        const failed = settled.filter(
          (r) =>
            r.status === 'rejected' ||
            (r.status === 'fulfilled' && !r.value.ok),
        );
        if (failed.length > 0)
          return {
            status: 'fail',
            error: `${failed.length}/${n} requests failed`,
          };
        return { status: 'pass' };
      },
      ctx,
    ),
  );

  // Rapid sequential POST /api/log
  results.push(
    await runTest(
      'stress.log.rapid',
      `${n}x rapid sequential POST /api/log`,
      'stress',
      async () => {
        let failures = 0;
        for (let i = 0; i < n; i++) {
          try {
            const res = await fetch(`${base}/api/log`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                level: 'debug',
                message: `watchdog stress test ${i}`,
                source: 'watchdog-stress',
              }),
              signal: AbortSignal.timeout(10000),
            });
            const data = await res.json();
            if (!data.ok) failures++;
          } catch {
            failures++;
          }
        }
        if (failures > 0)
          return {
            status: 'fail',
            error: `${failures}/${n} requests failed`,
          };
        return { status: 'pass' };
      },
      ctx,
    ),
  );

  // Concurrent video uploads
  results.push(
    await runTest(
      'stress.upload.concurrent',
      '3x concurrent video upload',
      'stress',
      async () => {
        const videoPath = path.join(FIXTURES_DIR, 'test-video.mp4');
        if (!fs.existsSync(videoPath))
          return { status: 'skip', error: 'Test fixture missing' };

        const buffer = fs.readFileSync(videoPath);
        const promises = Array.from({ length: 3 }, (_, i) => {
          const file = new File([buffer], `watchdog-stress-${i}.mp4`, {
            type: 'video/mp4',
          });
          const form = new FormData();
          form.append('videos', file);
          const start = Date.now();
          return fetch(`${base}/api/upload`, {
            method: 'POST',
            body: form,
            signal: AbortSignal.timeout(30000),
          }).then(async (res) => {
            const elapsed = Date.now() - start;
            const data = await res.json();
            // Track artifacts for cleanup
            if (data.videos) {
              for (const v of data.videos) {
                const absPath = path.join(
                  PROJECT_ROOT,
                  'public',
                  v.path.startsWith('/') ? v.path.slice(1) : v.path,
                );
                ctx.artifactPaths.push(absPath);
                if (v.thumbnail) {
                  const thumbAbs = path.join(
                    PROJECT_ROOT,
                    'public',
                    v.thumbnail.startsWith('/')
                      ? v.thumbnail.slice(1)
                      : v.thumbnail,
                  );
                  ctx.artifactPaths.push(thumbAbs);
                }
              }
            }
            return { ok: res.ok, elapsed };
          });
        });

        const settled = await Promise.allSettled(promises);
        const fulfilled = settled.filter(
          (r): r is PromiseFulfilledResult<{ ok: boolean; elapsed: number }> =>
            r.status === 'fulfilled',
        );
        const failed =
          fulfilled.filter((r) => !r.value.ok).length +
          settled.filter((r) => r.status === 'rejected').length;
        const slow = fulfilled.filter((r) => r.value.elapsed > 5000).length;

        if (failed > 0)
          return { status: 'fail', error: `${failed}/3 uploads failed` };
        if (slow > 0)
          return {
            status: 'warn',
            error: `${slow}/3 uploads took >5s`,
          };
        return { status: 'pass' };
      },
      ctx,
    ),
  );

  return results;
}

// ─── Phase 4: File System Checks ────────────────────────────────────────────

async function runFileSystemChecks(
  config: Config,
  ctx: CycleContext,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

  // Orphaned files in uploads/
  results.push(
    await runTest(
      'fs.orphans.uploads',
      'No orphaned files in uploads/',
      'filesystem',
      async () => {
        const dir = path.join(PROJECT_ROOT, 'public', 'uploads');
        if (!fs.existsSync(dir))
          return { status: 'skip', error: 'Directory missing' };

        const files = fs.readdirSync(dir);
        const orphans = files.filter((f) => {
          if (f === '.gitkeep' || f === '.DS_Store') return false;
          return !UUID_PATTERN.test(f);
        });
        if (orphans.length > 0)
          return {
            status: 'warn',
            error: `${orphans.length} non-UUID files: ${orphans.slice(0, 3).join(', ')}`,
          };
        return { status: 'pass' };
      },
      ctx,
    ),
  );

  // Old files in uploads/
  results.push(
    await runTest(
      'fs.old.uploads',
      `Files older than ${config.maxFileAgeHours}h in uploads/`,
      'filesystem',
      async () => {
        const dir = path.join(PROJECT_ROOT, 'public', 'uploads');
        if (!fs.existsSync(dir))
          return { status: 'skip', error: 'Directory missing' };

        const files = fs.readdirSync(dir);
        const maxAge = config.maxFileAgeHours * 60 * 60 * 1000;
        const now = Date.now();
        const old: { name: string; size: number }[] = [];

        for (const f of files) {
          if (f === '.gitkeep') continue;
          const fp = path.join(dir, f);
          try {
            const stat = fs.statSync(fp);
            if (!stat.isFile()) continue;
            if (now - stat.mtimeMs > maxAge) {
              old.push({ name: f, size: stat.size });
            }
          } catch {
            /* ignore stat errors */
          }
        }

        if (old.length === 0) return { status: 'pass' };

        if (config.autoCleanup) {
          let freed = 0;
          for (const f of old) {
            try {
              fs.unlinkSync(path.join(dir, f.name));
              freed += f.size;
              ctx.remediations.push(
                `Cleaned old file: ${f.name} (${formatBytes(f.size)})`,
              );
            } catch {
              /* ignore */
            }
          }
          return {
            status: 'warn',
            detail: `${old.length} old files auto-cleaned (${formatBytes(freed)} freed)`,
          };
        }
        return {
          status: 'warn',
          error: `${old.length} files older than ${config.maxFileAgeHours}h`,
        };
      },
      ctx,
    ),
  );

  // Old files in outputs/
  results.push(
    await runTest(
      'fs.old.outputs',
      `Files older than ${config.maxFileAgeHours}h in outputs/`,
      'filesystem',
      async () => {
        const dir = path.join(PROJECT_ROOT, 'public', 'outputs');
        if (!fs.existsSync(dir))
          return { status: 'skip', error: 'Directory missing' };

        const files = fs.readdirSync(dir);
        const maxAge = config.maxFileAgeHours * 60 * 60 * 1000;
        const now = Date.now();
        const old: { name: string; size: number }[] = [];

        for (const f of files) {
          if (f === '.gitkeep') continue;
          const fp = path.join(dir, f);
          try {
            const stat = fs.statSync(fp);
            if (!stat.isFile()) continue;
            if (now - stat.mtimeMs > maxAge) {
              old.push({ name: f, size: stat.size });
            }
          } catch {
            /* ignore */
          }
        }

        if (old.length === 0) return { status: 'pass' };

        if (config.autoCleanup) {
          let freed = 0;
          for (const f of old) {
            try {
              fs.unlinkSync(path.join(dir, f.name));
              freed += f.size;
              ctx.remediations.push(
                `Cleaned old output: ${f.name} (${formatBytes(f.size)})`,
              );
            } catch {
              /* ignore */
            }
          }
          return {
            status: 'warn',
            detail: `${old.length} old outputs auto-cleaned (${formatBytes(freed)} freed)`,
          };
        }
        return {
          status: 'warn',
          error: `${old.length} output files older than ${config.maxFileAgeHours}h`,
        };
      },
      ctx,
    ),
  );

  // Disk space
  results.push(
    await runTest(
      'fs.disk',
      'Disk space check',
      'filesystem',
      async () => {
        try {
          const output = execFileSync('df', ['-k', PROJECT_ROOT], {
            encoding: 'utf-8',
          });
          const lines = output.trim().split('\n');
          if (lines.length < 2)
            return { status: 'warn', error: 'Could not parse df output' };
          const parts = lines[1].split(/\s+/);
          const availKB = parseInt(parts[3], 10);
          const availBytes = availKB * 1024;

          if (availBytes < 100 * 1024 * 1024)
            return {
              status: 'fail',
              error: `Only ${formatBytes(availBytes)} free`,
            };
          if (availBytes < 1024 * 1024 * 1024)
            return {
              status: 'warn',
              error: `Low disk: ${formatBytes(availBytes)} free`,
            };
          return {
            status: 'pass',
            detail: `${formatBytes(availBytes)} free`,
          };
        } catch (err: any) {
          return { status: 'warn', error: `df failed: ${err.message}` };
        }
      },
      ctx,
    ),
  );

  // Leftover temp overlay directories
  results.push(
    await runTest(
      'fs.temp.overlays',
      'No leftover overlays_* temp dirs',
      'filesystem',
      async () => {
        const dir = path.join(PROJECT_ROOT, 'public', 'outputs');
        if (!fs.existsSync(dir))
          return { status: 'skip', error: 'Directory missing' };

        const entries = fs.readdirSync(dir);
        const tempDirs = entries.filter((e) => {
          if (!e.startsWith('overlays_')) return false;
          try {
            return fs.statSync(path.join(dir, e)).isDirectory();
          } catch {
            return false;
          }
        });

        if (tempDirs.length === 0) return { status: 'pass' };

        if (config.autoCleanup) {
          for (const d of tempDirs) {
            try {
              fs.rmSync(path.join(dir, d), { recursive: true, force: true });
              ctx.remediations.push(`Removed temp dir: ${d}`);
            } catch {
              /* ignore */
            }
          }
          return {
            status: 'warn',
            detail: `${tempDirs.length} temp dirs auto-cleaned`,
          };
        }
        return {
          status: 'warn',
          error: `${tempDirs.length} leftover overlays_* directories`,
        };
      },
      ctx,
    ),
  );

  return results;
}

// ─── Phase 5: Remediation ───────────────────────────────────────────────────

async function runRemediation(
  config: Config,
  ctx: CycleContext,
  healthResults: TestResult[],
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Auto-restart server if it's down
  if (!ctx.serverUp && config.autoRestart) {
    results.push(
      await runTest(
        'remediate.restart',
        'Auto-restart dev server',
        'remediation',
        async () => {
          // Try to kill anything on the port first
          try {
            const pid = execSync(`lsof -ti:${config.port}`, {
              encoding: 'utf-8',
            }).trim();
            if (pid) {
              for (const p of pid.split('\n')) {
                if (p.trim()) {
                  execSync(`kill ${p.trim()}`, { stdio: 'pipe' });
                }
              }
              ctx.remediations.push(
                `Killed stale process on port ${config.port} (PID ${pid.replace(/\n/g, ', ')})`,
              );
              await new Promise((r) => setTimeout(r, 2000));
            }
          } catch {
            /* no process on port — that's fine */
          }

          // Start dev server in background
          const child = spawn('npm', ['run', 'dev'], {
            cwd: PROJECT_ROOT,
            detached: true,
            stdio: 'ignore',
          });
          child.unref();
          ctx.remediations.push('Spawned npm run dev');

          // Wait for server to come up
          const maxWait = 20000;
          const start = Date.now();
          while (Date.now() - start < maxWait) {
            await new Promise((r) => setTimeout(r, 2000));
            try {
              const res = await fetch(config.baseUrl, {
                signal: AbortSignal.timeout(3000),
              });
              if (res.ok) {
                ctx.serverUp = true;
                return {
                  status: 'pass' as TestStatus,
                  detail: `Server restarted in ${Math.round((Date.now() - start) / 1000)}s`,
                };
              }
            } catch {
              /* still starting */
            }
          }
          return {
            status: 'fail' as TestStatus,
            error: 'Server did not come up within 20s',
          };
        },
        ctx,
      ),
    );
  }

  // Auto-create missing directories
  if (config.autoCreateDirs) {
    const dirs = ['public/uploads', 'public/outputs', 'public/music', 'logs'];
    for (const dir of dirs) {
      const fullPath = path.join(PROJECT_ROOT, dir);
      const healthResult = healthResults.find(
        (r) => r.id === `health.dir.${dir}`,
      );
      if (healthResult && healthResult.status === 'fail') {
        results.push(
          await runTest(
            `remediate.mkdir.${dir}`,
            `Create missing ${dir}/`,
            'remediation',
            async () => {
              fs.mkdirSync(fullPath, { recursive: true });
              ctx.remediations.push(`Created directory: ${dir}/`);
              return { status: 'pass' };
            },
            ctx,
          ),
        );
      }
    }
  }

  return results;
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

function cleanupArtifacts(ctx: CycleContext): void {
  for (const p of ctx.artifactPaths) {
    try {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    } catch {
      /* ignore cleanup errors */
    }
  }
}

// ─── Report ─────────────────────────────────────────────────────────────────

function writeReport(report: CycleReport): void {
  let history: CycleReport[] = [];
  if (fs.existsSync(REPORT_PATH)) {
    try {
      const existing: ReportFile = JSON.parse(
        fs.readFileSync(REPORT_PATH, 'utf-8'),
      );
      history = existing.history || [];
    } catch {
      /* corrupt file, start fresh */
    }
  }

  // Keep last 50 cycles
  history.push(report);
  if (history.length > 50) history = history.slice(-50);

  const reportFile: ReportFile = {
    lastCycle: report,
    history,
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(reportFile, null, 2));
}

// ─── Display ────────────────────────────────────────────────────────────────

function printHeader(cycle: number): void {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log('');
  console.log(`${c.bold}${'='.repeat(60)}${c.reset}`);
  console.log(
    `${c.bold}  WATCHDOG CYCLE #${cycle}${' '.repeat(Math.max(0, 38 - String(cycle).length - now.length))}${now}${c.reset}`,
  );
  console.log(`${c.bold}${'='.repeat(60)}${c.reset}`);
}

function printCategory(name: string): void {
  console.log('');
  console.log(`  ${c.bold}${name}${c.reset}`);
}

function printResult(r: TestResult): void {
  const duration =
    r.durationMs >= 0
      ? `${c.dim}${formatMs(r.durationMs)}${c.reset}`
      : `${c.dim}--${c.reset}`;
  const padding = Math.max(0, 50 - r.name.length);
  console.log(
    `  ${tag(r.status)}  ${r.name}${' '.repeat(padding)}${duration}`,
  );
  if (r.error && (r.status === 'fail' || r.status === 'warn')) {
    console.log(`          ${c.dim}${r.error}${c.reset}`);
  }
  if (r.detail) {
    console.log(`          ${c.dim}-> ${r.detail}${c.reset}`);
  }
}

function printRemediations(remediations: string[]): void {
  if (remediations.length === 0) return;
  printCategory('REMEDIATION LOG');
  for (const r of remediations) {
    console.log(`  ${fixTag()}  ${r}`);
  }
}

function printSummary(report: CycleReport, config: Config): void {
  const { passed, failed, warned, skipped } = report.summary;
  const total = passed + failed + warned + skipped;
  console.log('');
  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);
  const parts = [
    `${c.green}${passed}${c.reset} passed`,
    failed > 0
      ? `${c.boldRed}${failed}${c.reset} failed`
      : `${c.dim}0 failed${c.reset}`,
    warned > 0
      ? `${c.yellow}${warned}${c.reset} warned`
      : `${c.dim}0 warned${c.reset}`,
    skipped > 0 ? `${c.gray}${skipped}${c.reset} skipped` : '',
  ]
    .filter(Boolean)
    .join(', ');
  console.log(
    `  CYCLE #${report.cycle} SUMMARY: ${parts} (${total} total)`,
  );
  console.log(
    `  ${c.dim}Next cycle in ${config.intervalSeconds}s${c.reset}`,
  );
  console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`);
}

// ─── Main Loop ──────────────────────────────────────────────────────────────

let running = true;
let cycleCount = 0;

async function runCycle(config: Config): Promise<CycleReport> {
  cycleCount++;
  printHeader(cycleCount);

  const ctx: CycleContext = {
    serverUp: false,
    uploadedVideo: null,
    uploadedMusic: null,
    renderOutput: null,
    artifactPaths: [],
    remediations: [],
  };

  const allResults: TestResult[] = [];

  try {
    // Phase 1: Health
    printCategory('HEALTH CHECKS');
    const healthResults = await runHealthChecks(config, ctx);
    for (const r of healthResults) printResult(r);
    allResults.push(...healthResults);

    // Phase 5 (early): Remediation for server + dirs before API tests
    const earlyRemediations = await runRemediation(config, ctx, healthResults);
    if (earlyRemediations.length > 0) {
      printCategory('EARLY REMEDIATION');
      for (const r of earlyRemediations) printResult(r);
      allResults.push(...earlyRemediations);
    }

    // Phase 2: API
    printCategory('API FUNCTIONAL TESTS');
    const apiResults = await runApiTests(config, ctx);
    for (const r of apiResults) printResult(r);
    allResults.push(...apiResults);

    // Phase 3: Stress
    printCategory('STRESS TESTS');
    const stressResults = await runStressTests(config, ctx);
    for (const r of stressResults) printResult(r);
    allResults.push(...stressResults);

    // Phase 4: File System
    printCategory('FILE SYSTEM CHECKS');
    const fsResults = await runFileSystemChecks(config, ctx);
    for (const r of fsResults) printResult(r);
    allResults.push(...fsResults);

    // Print remediations
    printRemediations(ctx.remediations);
  } finally {
    // Always clean up test artifacts
    cleanupArtifacts(ctx);
  }

  const summary = {
    passed: allResults.filter((r) => r.status === 'pass').length,
    failed: allResults.filter((r) => r.status === 'fail').length,
    warned: allResults.filter((r) => r.status === 'warn').length,
    skipped: allResults.filter((r) => r.status === 'skip').length,
  };

  const report: CycleReport = {
    cycle: cycleCount,
    timestamp: new Date().toISOString(),
    results: allResults,
    remediations: ctx.remediations,
    summary,
    config,
  };

  printSummary(report, config);
  writeReport(report);

  return report;
}

async function sleep(ms: number): Promise<void> {
  const interval = 1000;
  let elapsed = 0;
  while (elapsed < ms && running) {
    await new Promise((r) => setTimeout(r, Math.min(interval, ms - elapsed)));
    elapsed += interval;
  }
}

async function main(): Promise<void> {
  console.log(
    `${c.bold}${c.cyan}╔══════════════════════════════════════════════════════════╗${c.reset}`,
  );
  console.log(
    `${c.bold}${c.cyan}║          WATCHDOG QA AGENT — Ad Video Creator           ║${c.reset}`,
  );
  console.log(
    `${c.bold}${c.cyan}╚══════════════════════════════════════════════════════════╝${c.reset}`,
  );

  const config = loadConfig();
  console.log(`${c.dim}  Base URL:      ${config.baseUrl}${c.reset}`);
  console.log(`${c.dim}  Interval:      ${config.intervalSeconds}s${c.reset}`);
  console.log(`${c.dim}  Auto-restart:  ${config.autoRestart}${c.reset}`);
  console.log(`${c.dim}  Auto-cleanup:  ${config.autoCleanup}${c.reset}`);
  console.log(`${c.dim}  Generate ads:  ${config.enableGenerateAds}${c.reset}`);
  console.log(
    `${c.dim}  Generate vid:  ${config.enableGenerateVideo}${c.reset}`,
  );

  // Generate test fixtures
  console.log('');
  ensureFixtures();
  console.log(`${c.dim}  Fixtures ready in ${FIXTURES_DIR}${c.reset}`);

  // Main loop
  while (running) {
    try {
      await runCycle(config);
    } catch (err: any) {
      console.error(`${c.boldRed}  CYCLE ERROR: ${err.message}${c.reset}`);
    }
    if (running) {
      await sleep(config.intervalSeconds * 1000);
    }
  }

  console.log(`\n${c.dim}  Watchdog stopped gracefully.${c.reset}`);
}

// Graceful shutdown
process.on('SIGINT', () => {
  running = false;
});
process.on('SIGTERM', () => {
  running = false;
});

main().catch((err) => {
  console.error(`${c.boldRed}Fatal error: ${err.message}${c.reset}`);
  process.exit(1);
});
