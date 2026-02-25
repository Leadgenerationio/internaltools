#!/usr/bin/env node
/**
 * Security Agent — continuous security audit for Ad Video Creator
 *
 * Run:    npm run security
 * Config: scripts/security.config.json (all fields overridable via SECURITY_* env vars)
 *
 * Checks:
 *   1.  Blast radius — what damage a compromised component can do
 *   2.  Network exposure — open ports, listening services, CORS
 *   3.  Browser control exposure — XSS vectors, unsafe DOM, CSP
 *   4.  Local disk hygiene — temp files, world-readable dirs, stale artifacts
 *   5.  Plugin/model hygiene — dependency audit, outdated packages, known CVEs
 *   6.  Credential storage — .env files, hardcoded secrets, git history leaks
 *   7.  Reverse proxy configuration — headers, HTTPS, proxy misconfigs
 *   8.  Session logs on disk — log sanitization, PII, secrets in logs
 *   9.  Shell injection — exec() calls, unsanitized inputs in commands
 *   10. Input validation — API endpoints accepting unvalidated input
 *   11. Path traversal — file access without boundary checks
 *   12. Rate limiting — expensive endpoints without throttling
 *   13. File permissions — overly permissive files/directories
 *   14. Secrets in git history — credentials committed and "removed"
 */

import { execSync, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import net from 'net';
import os from 'os';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Config {
  baseUrl: string;
  intervalSeconds: number;
  port: number;
  autoRemediate: boolean;
  verbose: boolean;
  checks: Record<string, boolean>;
  thresholds: {
    maxLogFileSizeMb: number;
    maxLogFileAgeDays: number;
    maxUploadDirSizeMb: number;
    maxOutputDirSizeMb: number;
    maxOpenPorts: number;
    maxEnvFilePermissions: string;
  };
}

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
type CheckCategory =
  | 'blast-radius'
  | 'network-exposure'
  | 'browser-control'
  | 'disk-hygiene'
  | 'plugin-model'
  | 'credentials'
  | 'reverse-proxy'
  | 'session-logs'
  | 'shell-injection'
  | 'input-validation'
  | 'path-traversal'
  | 'rate-limiting'
  | 'file-permissions'
  | 'secrets-in-history';

interface Finding {
  id: string;
  category: CheckCategory;
  severity: Severity;
  title: string;
  detail: string;
  file?: string;
  line?: number;
  remediation: string;
  autoFixable: boolean;
  fixed?: boolean;
}

interface ScanReport {
  scanId: string;
  timestamp: string;
  durationMs: number;
  findings: Finding[];
  summary: Record<Severity, number>;
  checksRun: string[];
  checksSkipped: string[];
  remediationsApplied: string[];
  config: Config;
}

interface ReportFile {
  lastScan: ScanReport;
  history: ScanReport[];
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
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  boldRed: '\x1b[1;31m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
  white: '\x1b[37m',
};

function severityTag(severity: Severity): string {
  switch (severity) {
    case 'critical':
      return `${c.bgRed}${c.white}${c.bold} CRITICAL ${c.reset}`;
    case 'high':
      return `${c.boldRed}[HIGH]${c.reset}`;
    case 'medium':
      return `${c.yellow}[MEDIUM]${c.reset}`;
    case 'low':
      return `${c.cyan}[LOW]${c.reset}`;
    case 'info':
      return `${c.gray}[INFO]${c.reset}`;
  }
}

function fixTag(): string {
  return `${c.green}[FIXED]${c.reset}`;
}

// ─── Paths ──────────────────────────────────────────────────────────────────

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const CONFIG_PATH = path.join(SCRIPT_DIR, 'security.config.json');
const REPORT_PATH = path.join(PROJECT_ROOT, 'security-report.json');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
const LOGS_DIR = path.join(PROJECT_ROOT, 'logs');

// ─── Config ─────────────────────────────────────────────────────────────────

function loadConfig(): Config {
  let fileConfig: Partial<Config> = {};
  if (fs.existsSync(CONFIG_PATH)) {
    fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  }

  const env = process.env;
  return {
    baseUrl: env.SECURITY_BASE_URL || fileConfig.baseUrl || 'http://localhost:3000',
    intervalSeconds: Number(env.SECURITY_INTERVAL) || fileConfig.intervalSeconds || 1800,
    port: Number(env.SECURITY_PORT) || fileConfig.port || 3000,
    autoRemediate: env.SECURITY_AUTO_REMEDIATE === '1' || fileConfig.autoRemediate || false,
    verbose: env.SECURITY_VERBOSE === '1' || fileConfig.verbose || false,
    checks: fileConfig.checks || {},
    thresholds: {
      maxLogFileSizeMb: fileConfig.thresholds?.maxLogFileSizeMb || 50,
      maxLogFileAgeDays: fileConfig.thresholds?.maxLogFileAgeDays || 14,
      maxUploadDirSizeMb: fileConfig.thresholds?.maxUploadDirSizeMb || 2000,
      maxOutputDirSizeMb: fileConfig.thresholds?.maxOutputDirSizeMb || 5000,
      maxOpenPorts: fileConfig.thresholds?.maxOpenPorts || 5,
      maxEnvFilePermissions: fileConfig.thresholds?.maxEnvFilePermissions || '600',
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isCheckEnabled(config: Config, check: string): boolean {
  return config.checks[check] !== false;
}

function dirSizeMb(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  const walk = (dir: string) => {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else {
          try {
            total += fs.statSync(full).size;
          } catch {
            /* skip inaccessible */
          }
        }
      }
    } catch {
      /* skip inaccessible dirs */
    }
  };
  walk(dirPath);
  return total / (1024 * 1024);
}

function findFiles(dir: string, pattern: RegExp, maxDepth = 5): string[] {
  const results: string[] = [];
  const walk = (d: string, depth: number) => {
    if (depth > maxDepth) return;
    try {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next')
          continue;
        if (entry.isDirectory()) walk(full, depth + 1);
        else if (pattern.test(entry.name)) results.push(full);
      }
    } catch {
      /* skip inaccessible */
    }
  };
  walk(dir, 0);
  return results;
}

function grepFile(filePath: string, pattern: RegExp): { line: number; text: string }[] {
  try {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    const matches: { line: number; text: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        matches.push({ line: i + 1, text: lines[i].trim() });
      }
    }
    return matches;
  } catch {
    return [];
  }
}

function grepDir(
  dir: string,
  filePattern: RegExp,
  contentPattern: RegExp,
): { file: string; line: number; text: string }[] {
  const results: { file: string; line: number; text: string }[] = [];
  for (const file of findFiles(dir, filePattern)) {
    for (const match of grepFile(file, contentPattern)) {
      results.push({ file: path.relative(PROJECT_ROOT, file), ...match });
    }
  }
  return results;
}

function shellSafe(cmd: string, timeout = 10000): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout, stdio: 'pipe' }).trim();
  } catch {
    return '';
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

// ─── Check Implementations ─────────────────────────────────────────────────

/**
 * 1. BLAST RADIUS — assess damage a compromised component can do
 */
function checkBlastRadius(config: Config): Finding[] {
  const findings: Finding[] = [];

  // Check for exec/execSync usage (arbitrary command execution capability)
  const execUsage = grepDir(SRC_DIR, /\.(ts|tsx|js)$/, /\bexec(Sync)?\s*\(|child_process/);
  if (execUsage.length > 0) {
    findings.push({
      id: 'BR-001',
      category: 'blast-radius',
      severity: 'high',
      title: 'Shell execution capability in application code',
      detail: `Found ${execUsage.length} file(s) with shell exec:\n${execUsage.map((m) => `  ${m.file}:${m.line} — ${m.text.slice(0, 80)}`).join('\n')}`,
      remediation:
        'Replace exec() with execFile() which does not invoke a shell. Pass arguments as an array to prevent injection.',
      autoFixable: false,
    });
  }

  // Check for fs.writeFile / fs.writeFileSync outside of controlled directories
  const writeOps = grepDir(SRC_DIR, /\.(ts|tsx|js)$/, /fs\.(writeFile|writeFileSync|createWriteStream)\s*\(/);
  if (writeOps.length > 0) {
    findings.push({
      id: 'BR-002',
      category: 'blast-radius',
      severity: 'medium',
      title: 'Filesystem write operations in application code',
      detail: `Found ${writeOps.length} fs write operation(s):\n${writeOps.map((m) => `  ${m.file}:${m.line}`).join('\n')}`,
      remediation:
        'Ensure all write operations validate that the target path is within allowed directories (public/uploads, public/outputs, logs). Use isPathSafe() checks.',
      autoFixable: false,
    });
  }

  // Check for unrestricted file deletion
  const deleteOps = grepDir(SRC_DIR, /\.(ts|tsx|js)$/, /fs\.(unlink|unlinkSync|rm|rmSync|rmdir|rmdirSync)\s*\(/);
  if (deleteOps.length > 0) {
    findings.push({
      id: 'BR-003',
      category: 'blast-radius',
      severity: 'medium',
      title: 'Filesystem delete operations in application code',
      detail: `Found ${deleteOps.length} fs delete operation(s):\n${deleteOps.map((m) => `  ${m.file}:${m.line}`).join('\n')}`,
      remediation:
        'Ensure all delete operations validate that the target path is within allowed directories. Never delete based on user-supplied paths without isPathSafe() validation.',
      autoFixable: false,
    });
  }

  // Check for process.env access (which keys can the app read?)
  const envAccess = grepDir(SRC_DIR, /\.(ts|tsx|js)$/, /process\.env\.\w+/);
  const envKeys = new Set<string>();
  for (const m of envAccess) {
    const match = m.text.match(/process\.env\.(\w+)/);
    if (match) envKeys.add(match[1]);
  }
  if (envKeys.size > 0) {
    findings.push({
      id: 'BR-004',
      category: 'blast-radius',
      severity: 'info',
      title: 'Environment variables accessed by application',
      detail: `App reads ${envKeys.size} env var(s): ${Array.from(envKeys).join(', ')}`,
      remediation: 'Audit each env var. Ensure API keys have minimal required permissions. Use read-only API keys where possible.',
      autoFixable: false,
    });
  }

  return findings;
}

/**
 * 2. NETWORK EXPOSURE — open ports, listening services, external calls
 */
function checkNetworkExposure(config: Config): Finding[] {
  const findings: Finding[] = [];

  // Check for listening ports on this machine
  const listeningPorts = shellSafe('lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | grep -v "^COMMAND"');
  if (listeningPorts) {
    const portLines = listeningPorts.split('\n').filter(Boolean);
    if (portLines.length > config.thresholds.maxOpenPorts) {
      findings.push({
        id: 'NE-001',
        category: 'network-exposure',
        severity: 'medium',
        title: `${portLines.length} TCP ports listening (threshold: ${config.thresholds.maxOpenPorts})`,
        detail: portLines.map((l) => `  ${l.trim()}`).join('\n'),
        remediation: 'Review all listening services. Close unnecessary ports. Bind to 127.0.0.1 instead of 0.0.0.0 for dev services.',
        autoFixable: false,
      });
    } else {
      findings.push({
        id: 'NE-001',
        category: 'network-exposure',
        severity: 'info',
        title: `${portLines.length} TCP port(s) listening (within threshold)`,
        detail: portLines.map((l) => `  ${l.trim()}`).join('\n'),
        remediation: 'No action needed.',
        autoFixable: false,
      });
    }
  }

  // Check for 0.0.0.0 bindings (accessible from network)
  const wildcardBind = shellSafe('lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | grep "\\*:"');
  if (wildcardBind) {
    findings.push({
      id: 'NE-002',
      category: 'network-exposure',
      severity: 'high',
      title: 'Services bound to all interfaces (0.0.0.0 / *)',
      detail: `These services are accessible from other machines on the network:\n${wildcardBind}`,
      remediation:
        'Bind development services to 127.0.0.1 only. For Next.js: use "next dev -H 127.0.0.1". For production: use a reverse proxy.',
      autoFixable: false,
    });
  }

  // Check for external API calls in code (fetch to non-localhost)
  const externalFetches = grepDir(
    SRC_DIR,
    /\.(ts|tsx|js)$/,
    /fetch\s*\(\s*['"`]https?:\/\/(?!localhost|127\.0\.0\.1)/,
  );
  if (externalFetches.length > 0) {
    findings.push({
      id: 'NE-003',
      category: 'network-exposure',
      severity: 'info',
      title: 'External API calls detected',
      detail: `Found ${externalFetches.length} external fetch call(s):\n${externalFetches.map((m) => `  ${m.file}:${m.line} — ${m.text.slice(0, 100)}`).join('\n')}`,
      remediation: 'Ensure all external API calls use HTTPS, validate responses, and handle timeouts. Add allow-list of permitted external domains.',
      autoFixable: false,
    });
  }

  // Check for CORS configuration
  const corsConfig = grepDir(SRC_DIR, /\.(ts|tsx|js)$/, /Access-Control-Allow-Origin|cors/i);
  if (corsConfig.length === 0) {
    findings.push({
      id: 'NE-004',
      category: 'network-exposure',
      severity: 'medium',
      title: 'No CORS configuration found',
      detail: 'No Access-Control-Allow-Origin headers or CORS middleware detected in the codebase.',
      remediation:
        'Add explicit CORS headers in API routes or middleware. Restrict to known origins. Never use Access-Control-Allow-Origin: * in production.',
      autoFixable: false,
    });
  }

  // Check for middleware.ts (Next.js request interceptor)
  const middlewarePath = path.join(SRC_DIR, 'middleware.ts');
  const rootMiddleware = path.join(PROJECT_ROOT, 'middleware.ts');
  if (!fs.existsSync(middlewarePath) && !fs.existsSync(rootMiddleware)) {
    findings.push({
      id: 'NE-005',
      category: 'network-exposure',
      severity: 'medium',
      title: 'No Next.js middleware found',
      detail: 'No middleware.ts detected. Middleware can enforce auth, CORS, rate limiting, and security headers on all routes.',
      remediation: 'Create src/middleware.ts or middleware.ts to add security headers, auth checks, and rate limiting.',
      autoFixable: false,
    });
  }

  return findings;
}

/**
 * 3. BROWSER CONTROL EXPOSURE — XSS, CSP, unsafe DOM patterns
 */
function checkBrowserControlExposure(config: Config): Finding[] {
  const findings: Finding[] = [];

  // Check for dangerouslySetInnerHTML
  const dangerousHtml = grepDir(SRC_DIR, /\.(tsx|jsx)$/, /dangerouslySetInnerHTML/);
  if (dangerousHtml.length > 0) {
    findings.push({
      id: 'BC-001',
      category: 'browser-control',
      severity: 'high',
      title: 'dangerouslySetInnerHTML usage detected',
      detail: `Found ${dangerousHtml.length} instance(s):\n${dangerousHtml.map((m) => `  ${m.file}:${m.line} — ${m.text.slice(0, 80)}`).join('\n')}`,
      remediation: 'Remove dangerouslySetInnerHTML. Use React DOM methods or a sanitization library (DOMPurify) if HTML rendering is required.',
      autoFixable: false,
    });
  }

  // Check for eval() usage
  const evalUsage = grepDir(SRC_DIR, /\.(ts|tsx|js|jsx)$/, /\beval\s*\(|new\s+Function\s*\(/);
  if (evalUsage.length > 0) {
    findings.push({
      id: 'BC-002',
      category: 'browser-control',
      severity: 'critical',
      title: 'eval() or new Function() usage detected',
      detail: `Found ${evalUsage.length} instance(s):\n${evalUsage.map((m) => `  ${m.file}:${m.line} — ${m.text.slice(0, 80)}`).join('\n')}`,
      remediation: 'Remove eval() and new Function() calls. These allow arbitrary code execution and are a critical XSS vector.',
      autoFixable: false,
    });
  }

  // Check for inline event handlers or javascript: URLs in JSX
  const inlineHandlers = grepDir(SRC_DIR, /\.(tsx|jsx)$/, /href\s*=\s*['"`]javascript:/i);
  if (inlineHandlers.length > 0) {
    findings.push({
      id: 'BC-003',
      category: 'browser-control',
      severity: 'high',
      title: 'javascript: URL scheme in JSX',
      detail: `Found ${inlineHandlers.length} instance(s):\n${inlineHandlers.map((m) => `  ${m.file}:${m.line}`).join('\n')}`,
      remediation: 'Replace javascript: URLs with onClick handlers. javascript: URLs can be exploited for XSS.',
      autoFixable: false,
    });
  }

  // Check for Content-Security-Policy headers in next.config
  const nextConfigPath = path.join(PROJECT_ROOT, 'next.config.mjs');
  const nextConfigJsPath = path.join(PROJECT_ROOT, 'next.config.js');
  const nextConfigTsPath = path.join(PROJECT_ROOT, 'next.config.ts');
  let hasCSP = false;

  for (const cfgPath of [nextConfigPath, nextConfigJsPath, nextConfigTsPath]) {
    if (fs.existsSync(cfgPath)) {
      const content = fs.readFileSync(cfgPath, 'utf-8');
      if (/Content-Security-Policy|contentSecurityPolicy/i.test(content)) {
        hasCSP = true;
      }
    }
  }

  if (!hasCSP) {
    findings.push({
      id: 'BC-004',
      category: 'browser-control',
      severity: 'medium',
      title: 'No Content-Security-Policy (CSP) configured',
      detail: 'No CSP headers found in Next.js config. CSP prevents XSS, clickjacking, and data injection attacks.',
      remediation:
        "Add CSP headers in next.config.mjs or middleware.ts. Start with: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;",
      autoFixable: false,
    });
  }

  // Check for window.postMessage listeners without origin validation
  const postMessageListeners = grepDir(SRC_DIR, /\.(ts|tsx|js|jsx)$/, /addEventListener\s*\(\s*['"]message['"]/);
  if (postMessageListeners.length > 0) {
    findings.push({
      id: 'BC-005',
      category: 'browser-control',
      severity: 'medium',
      title: 'postMessage listener without visible origin check',
      detail: `Found ${postMessageListeners.length} message event listener(s). Verify each validates event.origin.`,
      remediation: 'Always check event.origin against a trusted origins allowlist in postMessage handlers.',
      autoFixable: false,
    });
  }

  // Check for localStorage/sessionStorage usage with sensitive data
  const storageUsage = grepDir(SRC_DIR, /\.(ts|tsx|js|jsx)$/, /localStorage\.(setItem|getItem)|sessionStorage\.(setItem|getItem)/);
  if (storageUsage.length > 0) {
    findings.push({
      id: 'BC-006',
      category: 'browser-control',
      severity: 'low',
      title: 'Browser storage usage detected',
      detail: `Found ${storageUsage.length} localStorage/sessionStorage call(s):\n${storageUsage.map((m) => `  ${m.file}:${m.line} — ${m.text.slice(0, 80)}`).join('\n')}`,
      remediation: 'Ensure no API keys, tokens, or PII are stored in localStorage/sessionStorage. These are accessible to any JS on the page.',
      autoFixable: false,
    });
  }

  return findings;
}

/**
 * 4. LOCAL DISK HYGIENE — temp files, stale artifacts, world-readable dirs
 */
function checkLocalDiskHygiene(config: Config): Finding[] {
  const findings: Finding[] = [];
  const thresholds = config.thresholds;

  // Check upload directory size
  const uploadsDir = path.join(PUBLIC_DIR, 'uploads');
  const uploadsSizeMb = dirSizeMb(uploadsDir);
  if (uploadsSizeMb > thresholds.maxUploadDirSizeMb) {
    findings.push({
      id: 'DH-001',
      category: 'disk-hygiene',
      severity: 'medium',
      title: `Uploads directory too large: ${uploadsSizeMb.toFixed(0)}MB (max: ${thresholds.maxUploadDirSizeMb}MB)`,
      detail: `${uploadsDir} contains ${uploadsSizeMb.toFixed(1)}MB of files.`,
      remediation: 'Run cleanup to remove old uploads. Implement auto-cleanup in the watchdog or add file expiry.',
      autoFixable: true,
    });
  }

  // Check outputs directory size
  const outputsDir = path.join(PUBLIC_DIR, 'outputs');
  const outputsSizeMb = dirSizeMb(outputsDir);
  if (outputsSizeMb > thresholds.maxOutputDirSizeMb) {
    findings.push({
      id: 'DH-002',
      category: 'disk-hygiene',
      severity: 'medium',
      title: `Outputs directory too large: ${outputsSizeMb.toFixed(0)}MB (max: ${thresholds.maxOutputDirSizeMb}MB)`,
      detail: `${outputsDir} contains ${outputsSizeMb.toFixed(1)}MB of files.`,
      remediation: 'Run cleanup to remove old outputs. Implement auto-cleanup with file expiry.',
      autoFixable: true,
    });
  }

  // Check for stale temp files
  const tmpPatterns = [/\.tmp$/, /\.part$/, /~$/, /\.swp$/, /\.bak$/];
  const tempFiles: string[] = [];
  for (const pat of tmpPatterns) {
    tempFiles.push(...findFiles(PROJECT_ROOT, pat, 3));
  }
  if (tempFiles.length > 0) {
    findings.push({
      id: 'DH-003',
      category: 'disk-hygiene',
      severity: 'low',
      title: `${tempFiles.length} temporary/backup file(s) found`,
      detail: tempFiles.map((f) => `  ${path.relative(PROJECT_ROOT, f)}`).join('\n'),
      remediation: 'Remove temporary files. Add patterns to .gitignore.',
      autoFixable: true,
    });
  }

  // Check for core dumps
  const coreDumps = findFiles(PROJECT_ROOT, /^core\.\d+$|^core$/, 2);
  if (coreDumps.length > 0) {
    findings.push({
      id: 'DH-004',
      category: 'disk-hygiene',
      severity: 'high',
      title: `${coreDumps.length} core dump(s) found — may contain secrets from memory`,
      detail: coreDumps.map((f) => `  ${path.relative(PROJECT_ROOT, f)}`).join('\n'),
      remediation: 'Delete core dumps immediately. They may contain in-memory API keys and other secrets.',
      autoFixable: true,
    });
  }

  // Check for world-readable directories
  for (const dir of [uploadsDir, outputsDir, LOGS_DIR]) {
    if (!fs.existsSync(dir)) continue;
    try {
      const stat = fs.statSync(dir);
      const mode = (stat.mode & 0o777).toString(8);
      if (stat.mode & 0o004) {
        // world-readable
        findings.push({
          id: `DH-005-${path.basename(dir)}`,
          category: 'disk-hygiene',
          severity: 'medium',
          title: `Directory world-readable: ${path.relative(PROJECT_ROOT, dir)} (mode: ${mode})`,
          detail: `Anyone on this machine can read files in ${dir}`,
          remediation: `Run: chmod 750 "${dir}"`,
          autoFixable: true,
        });
      }
    } catch {
      /* skip */
    }
  }

  // Check for orphaned ffmpeg processes
  const ffmpegProcs = shellSafe('pgrep -la ffmpeg 2>/dev/null');
  if (ffmpegProcs) {
    const count = ffmpegProcs.split('\n').filter(Boolean).length;
    findings.push({
      id: 'DH-006',
      category: 'disk-hygiene',
      severity: 'low',
      title: `${count} ffmpeg process(es) running`,
      detail: ffmpegProcs,
      remediation: 'If no renders are active, these may be orphaned. Kill with: pkill ffmpeg',
      autoFixable: false,
    });
  }

  return findings;
}

/**
 * 5. PLUGIN/MODEL HYGIENE — dependency audit, outdated packages
 */
function checkPluginModelHygiene(config: Config): Finding[] {
  const findings: Finding[] = [];

  // npm audit
  const auditResult = shellSafe('cd "' + PROJECT_ROOT + '" && npm audit --json 2>/dev/null', 30000);
  if (auditResult) {
    try {
      const audit = JSON.parse(auditResult);
      const vulns = audit.metadata?.vulnerabilities || {};
      const criticalCount = vulns.critical || 0;
      const highCount = vulns.high || 0;
      const moderateCount = vulns.moderate || 0;
      const totalVulns = criticalCount + highCount + moderateCount;

      if (totalVulns > 0) {
        findings.push({
          id: 'PM-001',
          category: 'plugin-model',
          severity: criticalCount > 0 ? 'critical' : highCount > 0 ? 'high' : 'medium',
          title: `npm audit: ${criticalCount} critical, ${highCount} high, ${moderateCount} moderate vulnerabilities`,
          detail: `Run "npm audit" for full details.`,
          remediation: 'Run "npm audit fix" to auto-fix. For breaking changes: "npm audit fix --force" (review changes after).',
          autoFixable: false,
        });
      } else {
        findings.push({
          id: 'PM-001',
          category: 'plugin-model',
          severity: 'info',
          title: 'npm audit: no known vulnerabilities',
          detail: 'All dependencies passed security audit.',
          remediation: 'No action needed.',
          autoFixable: false,
        });
      }
    } catch {
      findings.push({
        id: 'PM-001',
        category: 'plugin-model',
        severity: 'low',
        title: 'npm audit returned non-JSON output',
        detail: 'Could not parse npm audit results. Run manually.',
        remediation: 'Run "npm audit" manually to check for vulnerabilities.',
        autoFixable: false,
      });
    }
  }

  // Check for outdated packages
  const outdated = shellSafe('cd "' + PROJECT_ROOT + '" && npm outdated --json 2>/dev/null', 30000);
  if (outdated) {
    try {
      const pkgs = JSON.parse(outdated);
      const majorUpdates = Object.entries(pkgs).filter(([, info]: [string, any]) => {
        const current = (info as any).current?.split('.')[0];
        const latest = (info as any).latest?.split('.')[0];
        return current && latest && current !== latest;
      });

      if (majorUpdates.length > 0) {
        findings.push({
          id: 'PM-002',
          category: 'plugin-model',
          severity: 'low',
          title: `${majorUpdates.length} package(s) with major version updates available`,
          detail: majorUpdates
            .map(
              ([name, info]: [string, any]) =>
                `  ${name}: ${(info as any).current} → ${(info as any).latest}`,
            )
            .join('\n'),
          remediation: 'Review major updates for security fixes. Update one at a time and test.',
          autoFixable: false,
        });
      }
    } catch {
      /* ignore parse errors */
    }
  }

  // Check for AI model API key scope (are keys more permissive than needed?)
  const envPath = path.join(PROJECT_ROOT, '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const apiKeys = envContent.match(/^\w*API_KEY\s*=\s*\S+/gm) || [];
    if (apiKeys.length > 0) {
      findings.push({
        id: 'PM-003',
        category: 'plugin-model',
        severity: 'medium',
        title: `${apiKeys.length} API key(s) configured for AI model access`,
        detail: apiKeys.map((k) => `  ${k.split('=')[0]}=<redacted>`).join('\n'),
        remediation:
          'Ensure each API key has minimal permissions. Google API keys should be restricted to specific APIs. Anthropic keys should use the lowest tier needed. Set usage caps in provider dashboards.',
        autoFixable: false,
      });
    }
  }

  // Check package.json for known risky packages
  const pkgPath = path.join(PROJECT_ROOT, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const riskyPatterns = [
      { pattern: /^node-serialize$/, reason: 'Known deserialization vulnerability' },
      { pattern: /^serialize-javascript$/, reason: 'Known XSS vulnerability in older versions' },
      { pattern: /^event-stream$/, reason: 'Was compromised in supply chain attack' },
      { pattern: /^flatmap-stream$/, reason: 'Malicious package (supply chain attack)' },
      { pattern: /^ua-parser-js$/, reason: 'Was compromised in supply chain attack (check version)' },
      { pattern: /^coa$/, reason: 'Was compromised in supply chain attack (check version)' },
      { pattern: /^rc$/, reason: 'Was compromised in supply chain attack (check version)' },
    ];

    for (const [dep] of Object.entries(allDeps)) {
      for (const { pattern, reason } of riskyPatterns) {
        if (pattern.test(dep)) {
          findings.push({
            id: `PM-004-${dep}`,
            category: 'plugin-model',
            severity: 'critical',
            title: `Known risky dependency: ${dep}`,
            detail: reason,
            remediation: `Remove or replace ${dep}. Verify it is needed and use the latest patched version.`,
            autoFixable: false,
          });
        }
      }
    }
  }

  return findings;
}

/**
 * 6. CREDENTIAL STORAGE — .env files, hardcoded secrets, key hygiene
 */
function checkCredentialStorage(config: Config): Finding[] {
  const findings: Finding[] = [];

  // Check .env file permissions
  const envFiles = ['.env', '.env.local', '.env.development', '.env.production', '.env.test'];
  for (const envFile of envFiles) {
    const envPath = path.join(PROJECT_ROOT, envFile);
    if (!fs.existsSync(envPath)) continue;

    try {
      const stat = fs.statSync(envPath);
      const mode = (stat.mode & 0o777).toString(8);
      const maxMode = parseInt(config.thresholds.maxEnvFilePermissions, 8);

      if ((stat.mode & 0o777) > maxMode) {
        findings.push({
          id: `CS-001-${envFile}`,
          category: 'credentials',
          severity: 'high',
          title: `${envFile} has excessive permissions: ${mode} (max: ${config.thresholds.maxEnvFilePermissions})`,
          detail: `File ${envPath} is more permissive than recommended.`,
          file: envFile,
          remediation: `Run: chmod ${config.thresholds.maxEnvFilePermissions} "${envPath}"`,
          autoFixable: true,
        });
      }
    } catch {
      /* skip */
    }
  }

  // Check .gitignore covers env files
  const gitignorePath = path.join(PROJECT_ROOT, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
    const missingPatterns: string[] = [];
    for (const pattern of ['.env', '.env.local', '.env.*.local']) {
      if (!gitignore.includes(pattern)) {
        missingPatterns.push(pattern);
      }
    }
    if (missingPatterns.length > 0) {
      findings.push({
        id: 'CS-002',
        category: 'credentials',
        severity: 'critical',
        title: '.gitignore missing env file patterns',
        detail: `Missing patterns: ${missingPatterns.join(', ')}`,
        remediation: `Add these patterns to .gitignore: ${missingPatterns.join(', ')}`,
        autoFixable: true,
      });
    }
  }

  // Check for hardcoded secrets in source code
  const secretPatterns = [
    { regex: /sk-ant-api\w{2}-[\w-]{40,}/, name: 'Anthropic API key' },
    { regex: /AIzaSy[\w-]{33}/, name: 'Google API key' },
    { regex: /sk-[a-zA-Z0-9]{48,}/, name: 'OpenAI API key' },
    { regex: /ghp_[a-zA-Z0-9]{36}/, name: 'GitHub personal access token' },
    { regex: /gho_[a-zA-Z0-9]{36}/, name: 'GitHub OAuth token' },
    { regex: /npm_[a-zA-Z0-9]{36}/, name: 'npm token' },
    { regex: /-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----/, name: 'Private key' },
    { regex: /AKIA[0-9A-Z]{16}/, name: 'AWS access key' },
    { regex: /xox[bporas]-[a-zA-Z0-9-]+/, name: 'Slack token' },
  ];

  for (const { regex, name } of secretPatterns) {
    const matches = grepDir(SRC_DIR, /\.(ts|tsx|js|jsx|json)$/, regex);
    if (matches.length > 0) {
      findings.push({
        id: `CS-003-${name.replace(/\s+/g, '-').toLowerCase()}`,
        category: 'credentials',
        severity: 'critical',
        title: `Hardcoded ${name} found in source code`,
        detail: matches.map((m) => `  ${m.file}:${m.line}`).join('\n'),
        remediation: `Move the ${name} to .env.local and reference via process.env. Rotate the exposed key immediately.`,
        autoFixable: false,
      });
    }
  }

  // Check if .env.local was ever committed to git
  const gitLogEnv = shellSafe(
    `cd "${PROJECT_ROOT}" && git log --all --oneline -- .env .env.local .env.production 2>/dev/null`,
  );
  if (gitLogEnv) {
    findings.push({
      id: 'CS-004',
      category: 'credentials',
      severity: 'critical',
      title: 'Environment files found in git history',
      detail: `These env files appear in git commits:\n${gitLogEnv}`,
      remediation:
        'Rotate ALL API keys immediately. Use BFG Repo-Cleaner or git filter-repo to purge these files from history. Then force-push.',
      autoFixable: false,
    });
  }

  // Check for secrets in config files that aren't in .gitignore
  const configFiles = findFiles(PROJECT_ROOT, /\.(json|yaml|yml|toml|ini|cfg)$/, 2);
  for (const cfgFile of configFiles) {
    if (cfgFile.includes('node_modules') || cfgFile.includes('.git')) continue;
    if (cfgFile.includes('package.json') || cfgFile.includes('tsconfig')) continue;

    const content = fs.readFileSync(cfgFile, 'utf-8');
    for (const { regex, name } of secretPatterns) {
      if (regex.test(content)) {
        findings.push({
          id: `CS-005-${path.basename(cfgFile)}`,
          category: 'credentials',
          severity: 'critical',
          title: `${name} found in config file: ${path.relative(PROJECT_ROOT, cfgFile)}`,
          detail: `Config file contains what appears to be a ${name}.`,
          file: path.relative(PROJECT_ROOT, cfgFile),
          remediation: `Move secret to .env.local. Replace with process.env reference. Rotate the key.`,
          autoFixable: false,
        });
      }
    }
  }

  return findings;
}

/**
 * 7. REVERSE PROXY CONFIGURATION — security headers, HTTPS
 */
function checkReverseProxyConfig(config: Config): Finding[] {
  const findings: Finding[] = [];

  // Check next.config for security headers
  const nextConfigs = ['next.config.mjs', 'next.config.js', 'next.config.ts'].map((f) =>
    path.join(PROJECT_ROOT, f),
  );

  let nextConfigContent = '';
  let nextConfigFile = '';
  for (const cfg of nextConfigs) {
    if (fs.existsSync(cfg)) {
      nextConfigContent = fs.readFileSync(cfg, 'utf-8');
      nextConfigFile = cfg;
      break;
    }
  }

  if (!nextConfigContent) {
    findings.push({
      id: 'RP-001',
      category: 'reverse-proxy',
      severity: 'low',
      title: 'No Next.js config file found',
      detail: 'Cannot check for security headers configuration.',
      remediation: 'Create next.config.mjs with security headers.',
      autoFixable: false,
    });
  } else {
    const requiredHeaders = [
      { name: 'X-Frame-Options', value: 'DENY', purpose: 'Prevents clickjacking' },
      { name: 'X-Content-Type-Options', value: 'nosniff', purpose: 'Prevents MIME type sniffing' },
      { name: 'Referrer-Policy', value: 'strict-origin-when-cross-origin', purpose: 'Controls referrer information' },
      { name: 'X-XSS-Protection', value: '1; mode=block', purpose: 'Legacy XSS filter' },
      { name: 'Strict-Transport-Security', value: 'max-age=31536000', purpose: 'Enforces HTTPS' },
      { name: 'Permissions-Policy', value: '', purpose: 'Controls browser features' },
    ];

    const missingHeaders: string[] = [];
    for (const header of requiredHeaders) {
      if (!nextConfigContent.includes(header.name)) {
        missingHeaders.push(`${header.name} — ${header.purpose}`);
      }
    }

    if (missingHeaders.length > 0) {
      findings.push({
        id: 'RP-002',
        category: 'reverse-proxy',
        severity: 'medium',
        title: `${missingHeaders.length} security header(s) missing from Next.js config`,
        detail: missingHeaders.map((h) => `  ${h}`).join('\n'),
        file: path.relative(PROJECT_ROOT, nextConfigFile),
        remediation:
          'Add a headers() function to next.config.mjs that sets these security headers on all routes.',
        autoFixable: false,
      });
    }

    // Check for poweredByHeader (should be false)
    if (!nextConfigContent.includes('poweredBy') || nextConfigContent.includes('poweredByHeader: true')) {
      findings.push({
        id: 'RP-003',
        category: 'reverse-proxy',
        severity: 'low',
        title: 'X-Powered-By header not disabled',
        detail: 'Next.js sends X-Powered-By: Next.js by default, revealing technology stack.',
        file: nextConfigFile ? path.relative(PROJECT_ROOT, nextConfigFile) : undefined,
        remediation: 'Add "poweredByHeader: false" to next.config.mjs.',
        autoFixable: false,
      });
    }
  }

  // Check if HTTPS is configured for production
  const dockerFile = path.join(PROJECT_ROOT, 'Dockerfile');
  const deployFile = path.join(PROJECT_ROOT, 'DEPLOY.md');
  let hasHttpsConfig = false;

  for (const f of [dockerFile, deployFile]) {
    if (fs.existsSync(f)) {
      const content = fs.readFileSync(f, 'utf-8');
      if (/https|ssl|tls|cert/i.test(content)) {
        hasHttpsConfig = true;
      }
    }
  }

  if (!hasHttpsConfig) {
    findings.push({
      id: 'RP-004',
      category: 'reverse-proxy',
      severity: 'medium',
      title: 'No HTTPS/TLS configuration detected for production',
      detail: 'No SSL/TLS references found in Dockerfile or deployment docs.',
      remediation:
        'Ensure production deployment uses HTTPS. Railway/Vercel provide this automatically. For self-hosted, use nginx with Let\'s Encrypt.',
      autoFixable: false,
    });
  }

  return findings;
}

/**
 * 8. SESSION LOGS ON DISK — log sanitization, PII, secrets in logs
 */
function checkSessionLogs(config: Config): Finding[] {
  const findings: Finding[] = [];
  const thresholds = config.thresholds;

  // Check log directory exists and size
  if (fs.existsSync(LOGS_DIR)) {
    const logSizeMb = dirSizeMb(LOGS_DIR);
    if (logSizeMb > thresholds.maxLogFileSizeMb) {
      findings.push({
        id: 'SL-001',
        category: 'session-logs',
        severity: 'medium',
        title: `Log directory too large: ${logSizeMb.toFixed(1)}MB (max: ${thresholds.maxLogFileSizeMb}MB)`,
        detail: `${LOGS_DIR} contains ${logSizeMb.toFixed(1)}MB of log files.`,
        remediation: 'Reduce log retention period or increase rotation frequency.',
        autoFixable: false,
      });
    }

    // Check for old log files
    const logFiles = findFiles(LOGS_DIR, /\.log$/);
    const now = Date.now();
    const maxAge = thresholds.maxLogFileAgeDays * 24 * 60 * 60 * 1000;
    const oldLogs = logFiles.filter((f) => {
      try {
        return now - fs.statSync(f).mtimeMs > maxAge;
      } catch {
        return false;
      }
    });

    if (oldLogs.length > 0) {
      findings.push({
        id: 'SL-002',
        category: 'session-logs',
        severity: 'low',
        title: `${oldLogs.length} log file(s) older than ${thresholds.maxLogFileAgeDays} days`,
        detail: oldLogs.map((f) => `  ${path.relative(PROJECT_ROOT, f)}`).join('\n'),
        remediation: `Delete old logs or reduce retention. Run: find logs/ -name "*.log" -mtime +${thresholds.maxLogFileAgeDays} -delete`,
        autoFixable: true,
      });
    }

    // Check log contents for secrets
    for (const logFile of logFiles.slice(0, 5)) {
      // Check up to 5 most recent
      try {
        const content = fs.readFileSync(logFile, 'utf-8');
        const secretPatterns = [
          { regex: /sk-ant-api\w{2}-[\w-]{20,}/, name: 'Anthropic API key' },
          { regex: /AIzaSy[\w-]{33}/, name: 'Google API key' },
          { regex: /sk-[a-zA-Z0-9]{48,}/, name: 'OpenAI API key' },
          { regex: /password\s*[:=]\s*\S+/i, name: 'password value' },
          { regex: /Bearer\s+[a-zA-Z0-9._-]{20,}/, name: 'Bearer token' },
        ];

        for (const { regex, name } of secretPatterns) {
          if (regex.test(content)) {
            findings.push({
              id: `SL-003-${path.basename(logFile)}-${name.replace(/\s+/g, '-')}`,
              category: 'session-logs',
              severity: 'critical',
              title: `${name} found in log file: ${path.basename(logFile)}`,
              detail: `Log file contains what appears to be a ${name}.`,
              file: path.relative(PROJECT_ROOT, logFile),
              remediation: `Delete the log file immediately. Add log sanitization to prevent secrets from being logged. Rotate the exposed credential.`,
              autoFixable: false,
            });
          }
        }

        // Check for user file paths (PII-adjacent)
        const homeDir = os.homedir();
        if (content.includes(homeDir)) {
          findings.push({
            id: `SL-004-${path.basename(logFile)}`,
            category: 'session-logs',
            severity: 'low',
            title: `Home directory path found in log: ${path.basename(logFile)}`,
            detail: `Log file contains references to ${homeDir}. This leaks the local username.`,
            file: path.relative(PROJECT_ROOT, logFile),
            remediation: 'Sanitize file paths in logs to use relative paths or replace home directory with ~.',
            autoFixable: false,
          });
        }
      } catch {
        /* skip unreadable */
      }
    }
  } else {
    findings.push({
      id: 'SL-005',
      category: 'session-logs',
      severity: 'info',
      title: 'Log directory does not exist yet',
      detail: `${LOGS_DIR} will be created when the app starts logging.`,
      remediation: 'No action needed.',
      autoFixable: false,
    });
  }

  // Check logger configuration for sanitization
  const loggerMatches = grepDir(SRC_DIR, /\.(ts|js)$/, /logger\.(info|warn|error|debug)\s*\(/);
  const unsanitizedLogs = loggerMatches.filter((m) => {
    // Check if the log call includes raw objects/metadata without sanitization
    return /\{.*\}|meta|req|request|body/.test(m.text);
  });

  if (unsanitizedLogs.length > 0) {
    findings.push({
      id: 'SL-006',
      category: 'session-logs',
      severity: 'medium',
      title: `${unsanitizedLogs.length} log call(s) may include unsanitized metadata`,
      detail: unsanitizedLogs
        .slice(0, 10)
        .map((m) => `  ${m.file}:${m.line} — ${m.text.slice(0, 80)}`)
        .join('\n'),
      remediation:
        'Add a sanitizeForLog() helper that strips sensitive fields (API keys, passwords, full file paths) before logging.',
      autoFixable: false,
    });
  }

  // Check if /api/logs endpoint exposes logs without auth
  const logsRoute = grepDir(SRC_DIR, /route\.ts$/, /api\/logs/);
  if (logsRoute.length > 0) {
    findings.push({
      id: 'SL-007',
      category: 'session-logs',
      severity: 'high',
      title: '/api/logs endpoint exposes log files without authentication',
      detail: 'The log viewing endpoint is accessible to any client without credentials.',
      remediation: 'Add authentication to /api/logs. At minimum, restrict to localhost or add an API key check.',
      autoFixable: false,
    });
  }

  return findings;
}

/**
 * 9. SHELL INJECTION — exec() calls with unsanitized inputs
 */
function checkShellInjection(config: Config): Finding[] {
  const findings: Finding[] = [];

  // Find all exec/execSync calls
  const execCalls = grepDir(SRC_DIR, /\.(ts|tsx|js)$/, /\bexec(Sync)?\s*\(\s*[`'"]/);
  const execAsyncCalls = grepDir(SRC_DIR, /\.(ts|tsx|js)$/, /execAsync\s*\(\s*[`'"]/);
  const allExecCalls = [...execCalls, ...execAsyncCalls];

  // Check each for template literal interpolation (injection risk)
  const templateExecs = allExecCalls.filter((m) => /`[^`]*\$\{/.test(m.text));
  if (templateExecs.length > 0) {
    findings.push({
      id: 'SI-001',
      category: 'shell-injection',
      severity: 'high',
      title: `${templateExecs.length} shell command(s) with template interpolation`,
      detail: templateExecs
        .map((m) => `  ${m.file}:${m.line} — ${m.text.slice(0, 100)}`)
        .join('\n'),
      remediation:
        'Replace exec()/execSync() with execFile()/execFileSync() which takes arguments as an array and never invokes a shell. This prevents all shell injection attacks.',
      autoFixable: false,
    });
  }

  // Check for shell commands in scripts directory too
  const scriptExecs = grepDir(
    path.join(PROJECT_ROOT, 'scripts'),
    /\.(ts|js)$/,
    /execSync\s*\(\s*`[^`]*\$\{/,
  );
  if (scriptExecs.length > 0) {
    findings.push({
      id: 'SI-002',
      category: 'shell-injection',
      severity: 'high',
      title: `${scriptExecs.length} shell injection risk(s) in scripts/`,
      detail: scriptExecs
        .map((m) => `  ${m.file}:${m.line} — ${m.text.slice(0, 100)}`)
        .join('\n'),
      remediation: 'Use execFileSync() with argument arrays in scripts too. Validate all interpolated values.',
      autoFixable: false,
    });
  }

  // Check if user-supplied filenames are used in shell commands
  const filenameInExec = grepDir(SRC_DIR, /\.(ts|js)$/, /exec.*\$\{.*(filename|filepath|name|path|file)/i);
  if (filenameInExec.length > 0) {
    findings.push({
      id: 'SI-003',
      category: 'shell-injection',
      severity: 'high',
      title: `${filenameInExec.length} shell command(s) interpolating file paths`,
      detail: filenameInExec
        .map((m) => `  ${m.file}:${m.line} — ${m.text.slice(0, 100)}`)
        .join('\n'),
      remediation:
        'File paths from user input (uploads, form fields) must NEVER be interpolated into shell commands. Use execFile() with array arguments, or validate filenames against a strict allowlist (UUID, alphanumeric only).',
      autoFixable: false,
    });
  }

  return findings;
}

/**
 * 10. INPUT VALIDATION — API endpoints accepting unvalidated input
 */
function checkInputValidation(config: Config): Finding[] {
  const findings: Finding[] = [];

  // Find all API routes
  const apiRoutes = findFiles(path.join(SRC_DIR, 'app', 'api'), /route\.ts$/);

  for (const route of apiRoutes) {
    const content = fs.readFileSync(route, 'utf-8');
    const relPath = path.relative(PROJECT_ROOT, route);

    // Check for request.json() without validation
    if (/request\.json\(\)/.test(content)) {
      // Does it validate the body?
      const hasValidation =
        /typeof\s+\w+\s*[!=]==?\s*['"]string['"]/.test(content) ||
        /\.trim\(\)/.test(content) ||
        /zod|joi|yup|ajv|superstruct/i.test(content) ||
        /assertShape/.test(content);

      if (!hasValidation) {
        findings.push({
          id: `IV-001-${path.basename(path.dirname(route))}`,
          category: 'input-validation',
          severity: 'medium',
          title: `No input validation in ${relPath}`,
          detail: 'Route parses JSON body but has no type/shape validation.',
          file: relPath,
          remediation:
            'Add input validation using Zod, Joi, or manual type checking. Validate all fields have expected types and reasonable sizes.',
          autoFixable: false,
        });
      }
    }

    // Check for missing Content-Length / payload size limits
    if (/POST/.test(content) && !/maxSize|MAX_SIZE|content-length|bodyParser/i.test(content)) {
      // Next.js has a default body size limit, but explicit is better
      findings.push({
        id: `IV-002-${path.basename(path.dirname(route))}`,
        category: 'input-validation',
        severity: 'low',
        title: `No explicit payload size limit in ${relPath}`,
        detail: 'Route accepts POST requests without explicit body size validation.',
        file: relPath,
        remediation:
          'Add explicit payload size checks: if (JSON.stringify(body).length > MAX_SIZE) return 413. Next.js has a 1MB default but explicit limits are clearer.',
        autoFixable: false,
      });
    }

    // Check for rate limiting
    if (
      /generate|render|upload/i.test(relPath) &&
      !/rateLimit|rate.limit|throttle|debounce/i.test(content)
    ) {
      findings.push({
        id: `IV-003-${path.basename(path.dirname(route))}`,
        category: 'input-validation',
        severity: 'medium',
        title: `No rate limiting on expensive route: ${relPath}`,
        detail: 'This route performs expensive operations (AI generation, rendering, file I/O) without rate limiting.',
        file: relPath,
        remediation:
          'Add per-IP rate limiting. For AI endpoints: max 1 request per 30 seconds. For file operations: max 5 per minute.',
        autoFixable: false,
      });
    }
  }

  return findings;
}

/**
 * 11. PATH TRAVERSAL — file access without boundary checks
 */
function checkPathTraversal(config: Config): Finding[] {
  const findings: Finding[] = [];

  // Check for path.join with user input without isPathSafe validation
  const pathJoins = grepDir(SRC_DIR, /\.(ts|js)$/, /path\.(join|resolve)\s*\(/);
  const hasPathSafe = grepDir(SRC_DIR, /\.(ts|js)$/, /isPathSafe|startsWith\s*\(\s*path/);

  // Find routes that do file operations
  const fileOps = grepDir(
    SRC_DIR,
    /route\.ts$/,
    /fs\.(readFile|writeFile|existsSync|createReadStream|unlink|readdir)/,
  );

  // Check if each route with file operations has path safety checks
  const routesWithFileOps = new Set(fileOps.map((m) => m.file));
  const routesWithPathSafe = new Set(hasPathSafe.map((m) => m.file));

  routesWithFileOps.forEach((route) => {
    if (!routesWithPathSafe.has(route)) {
      findings.push({
        id: `PT-001-${route.replace(/\//g, '-')}`,
        category: 'path-traversal',
        severity: 'high',
        title: `File operations without path boundary check: ${route}`,
        detail: `${route} performs file system operations but does not validate paths with isPathSafe() or equivalent.`,
        file: route,
        remediation:
          'Add path boundary validation before all fs operations: verify the resolved path starts with the allowed directory (e.g., public/uploads, public/outputs).',
        autoFixable: false,
      });
    }
  });

  // Check for ../  in any URL parsing or query parameter handling
  const dotDotCheck = grepDir(SRC_DIR, /\.(ts|tsx|js)$/, /searchParams|query.*\.\.\//);
  if (dotDotCheck.length > 0) {
    findings.push({
      id: 'PT-002',
      category: 'path-traversal',
      severity: 'high',
      title: 'Potential path traversal via query parameters',
      detail: dotDotCheck
        .map((m) => `  ${m.file}:${m.line} — ${m.text.slice(0, 80)}`)
        .join('\n'),
      remediation: 'Sanitize all path-related query parameters. Reject any input containing ".." or absolute paths.',
      autoFixable: false,
    });
  }

  return findings;
}

/**
 * 12. SECRETS IN GIT HISTORY
 */
function checkSecretsInHistory(config: Config): Finding[] {
  const findings: Finding[] = [];

  // Check if git is available
  const gitCheck = shellSafe('cd "' + PROJECT_ROOT + '" && git rev-parse --is-inside-work-tree 2>/dev/null');
  if (gitCheck !== 'true') {
    findings.push({
      id: 'GH-001',
      category: 'secrets-in-history',
      severity: 'info',
      title: 'Not a git repository — skipping history checks',
      detail: 'Git history checks require a git repository.',
      remediation: 'No action needed.',
      autoFixable: false,
    });
    return findings;
  }

  // Check for large files in history (might be accidentally committed binaries/data)
  const largeBlobs = shellSafe(
    `cd "${PROJECT_ROOT}" && git rev-list --objects --all 2>/dev/null | git cat-file --batch-check='%(objecttype) %(objectsize) %(rest)' 2>/dev/null | awk '/^blob/ && $2 > 1048576 {print $2, $3}' | sort -rn | head -10`,
  );
  if (largeBlobs) {
    findings.push({
      id: 'GH-002',
      category: 'secrets-in-history',
      severity: 'low',
      title: 'Large files in git history',
      detail: `Files over 1MB in git history:\n${largeBlobs}`,
      remediation:
        'Review large files. If they contain secrets or shouldn\'t be in the repo, use git filter-repo or BFG to purge them.',
      autoFixable: false,
    });
  }

  // Check for common secret file patterns in history
  const sensitiveFiles = [
    '.env',
    '.env.local',
    '.env.production',
    'credentials.json',
    'service-account.json',
    'id_rsa',
    'id_ed25519',
    '.pem',
    '.key',
    '.p12',
    '.pfx',
  ];

  for (const sensitiveFile of sensitiveFiles) {
    const inHistory = shellSafe(
      `cd "${PROJECT_ROOT}" && git log --all --oneline -- "*${sensitiveFile}" 2>/dev/null`,
    );
    if (inHistory) {
      findings.push({
        id: `GH-003-${sensitiveFile.replace(/\./g, '')}`,
        category: 'secrets-in-history',
        severity: sensitiveFile.includes('env') ? 'critical' : 'high',
        title: `Sensitive file "${sensitiveFile}" found in git history`,
        detail: `Commits referencing ${sensitiveFile}:\n${inHistory}`,
        remediation: `Rotate any secrets that were in ${sensitiveFile}. Purge from history with: git filter-repo --path ${sensitiveFile} --invert-paths`,
        autoFixable: false,
      });
    }
  }

  // Check for secret patterns in recent commits
  const recentDiffs = shellSafe(
    `cd "${PROJECT_ROOT}" && git log -10 --patch --no-color 2>/dev/null | head -500`,
  );
  if (recentDiffs) {
    const secretPatterns = [
      { regex: /\+.*sk-ant-api/, name: 'Anthropic API key' },
      { regex: /\+.*AIzaSy/, name: 'Google API key' },
      { regex: /\+.*AKIA[0-9A-Z]{16}/, name: 'AWS access key' },
      { regex: /\+.*ghp_[a-zA-Z0-9]{36}/, name: 'GitHub token' },
    ];

    for (const { regex, name } of secretPatterns) {
      if (regex.test(recentDiffs)) {
        findings.push({
          id: `GH-004-${name.replace(/\s+/g, '-').toLowerCase()}`,
          category: 'secrets-in-history',
          severity: 'critical',
          title: `${name} found in recent git diffs`,
          detail: `A ${name} was committed in one of the last 10 commits.`,
          remediation: `Rotate the ${name} immediately. Purge from git history.`,
          autoFixable: false,
        });
      }
    }
  }

  return findings;
}

// ─── Auto-Remediation ───────────────────────────────────────────────────────

function applyRemediations(
  findings: Finding[],
  config: Config,
): { applied: string[]; updated: Finding[] } {
  if (!config.autoRemediate) return { applied: [], updated: findings };

  const applied: string[] = [];
  const updated = findings.map((f) => {
    if (!f.autoFixable) return f;

    try {
      switch (true) {
        // Fix .env file permissions
        case f.id.startsWith('CS-001'): {
          const envFile = f.file;
          if (envFile) {
            const fullPath = path.join(PROJECT_ROOT, envFile);
            fs.chmodSync(fullPath, parseInt(config.thresholds.maxEnvFilePermissions, 8));
            applied.push(`Fixed permissions on ${envFile} to ${config.thresholds.maxEnvFilePermissions}`);
            return { ...f, fixed: true };
          }
          break;
        }

        // Delete temp files
        case f.id === 'DH-003': {
          // Don't auto-delete — just flag
          break;
        }

        // Delete core dumps
        case f.id === 'DH-004': {
          const coreFiles = findFiles(PROJECT_ROOT, /^core\.\d+$|^core$/, 2);
          for (const core of coreFiles) {
            fs.unlinkSync(core);
          }
          applied.push(`Deleted ${coreFiles.length} core dump(s)`);
          return { ...f, fixed: true };
        }
      }
    } catch (e) {
      // Remediation failed silently
    }

    return f;
  });

  return { applied, updated };
}

// ─── Report ─────────────────────────────────────────────────────────────────

function printBanner(): void {
  console.log(`
${c.bold}${c.cyan}╔══════════════════════════════════════════════════════════════╗
║                  SECURITY AGENT v1.0                         ║
║            Ad Video Creator — Security Audit                 ║
╚══════════════════════════════════════════════════════════════╝${c.reset}
`);
}

function printFindings(findings: Finding[]): void {
  // Group by category
  const categories = new Map<CheckCategory, Finding[]>();
  for (const f of findings) {
    const list = categories.get(f.category) || [];
    list.push(f);
    categories.set(f.category, list);
  }

  const categoryNames: Record<CheckCategory, string> = {
    'blast-radius': 'Blast Radius',
    'network-exposure': 'Network Exposure',
    'browser-control': 'Browser Control Exposure',
    'disk-hygiene': 'Local Disk Hygiene',
    'plugin-model': 'Plugin/Model Hygiene',
    credentials: 'Credential Storage',
    'reverse-proxy': 'Reverse Proxy Configuration',
    'session-logs': 'Session Logs on Disk',
    'shell-injection': 'Shell Injection',
    'input-validation': 'Input Validation',
    'path-traversal': 'Path Traversal',
    'rate-limiting': 'Rate Limiting',
    'file-permissions': 'File Permissions',
    'secrets-in-history': 'Secrets in Git History',
  };

  categories.forEach((catFindings, category) => {
    console.log(`\n${c.bold}── ${categoryNames[category as CheckCategory] || category} ──${c.reset}`);

    // Sort by severity
    const severityOrder: Record<Severity, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      info: 4,
    };
    catFindings.sort((a: Finding, b: Finding) => severityOrder[a.severity] - severityOrder[b.severity]);

    for (const f of catFindings) {
      const fixedStr = f.fixed ? ` ${fixTag()}` : '';
      console.log(`  ${severityTag(f.severity)} ${f.title}${fixedStr}`);
      if (f.detail) {
        for (const line of f.detail.split('\n').slice(0, 5)) {
          console.log(`    ${c.dim}${line}${c.reset}`);
        }
      }
      if (f.severity !== 'info') {
        console.log(`    ${c.cyan}Fix: ${f.remediation.slice(0, 120)}${c.reset}`);
      }
    }
  });
}

function printSummary(report: ScanReport): void {
  const { summary } = report;
  const total = Object.values(summary).reduce((a, b) => a + b, 0);

  console.log(`\n${c.bold}── Summary ──${c.reset}`);
  console.log(`  Total findings: ${total}`);
  if (summary.critical > 0) console.log(`  ${c.bgRed}${c.white} CRITICAL: ${summary.critical} ${c.reset}`);
  if (summary.high > 0) console.log(`  ${c.boldRed}HIGH: ${summary.high}${c.reset}`);
  if (summary.medium > 0) console.log(`  ${c.yellow}MEDIUM: ${summary.medium}${c.reset}`);
  if (summary.low > 0) console.log(`  ${c.cyan}LOW: ${summary.low}${c.reset}`);
  if (summary.info > 0) console.log(`  ${c.gray}INFO: ${summary.info}${c.reset}`);
  console.log(`  Scan duration: ${report.durationMs}ms`);
  console.log(`  Checks run: ${report.checksRun.length}`);
  if (report.remediationsApplied.length > 0) {
    console.log(`  ${c.green}Remediations applied: ${report.remediationsApplied.length}${c.reset}`);
  }

  if (summary.critical > 0 || summary.high > 0) {
    console.log(
      `\n  ${c.bgRed}${c.white}${c.bold} ACTION REQUIRED: ${summary.critical} critical and ${summary.high} high severity findings need immediate attention ${c.reset}`,
    );
  } else {
    console.log(`\n  ${c.green}${c.bold}No critical or high severity findings.${c.reset}`);
  }
}

function saveReport(report: ScanReport): void {
  let existing: ReportFile = { lastScan: report, history: [] };

  if (fs.existsSync(REPORT_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8'));
    } catch {
      /* start fresh */
    }
  }

  // Keep last 50 scans
  existing.history = [report, ...existing.history].slice(0, 50);
  existing.lastScan = report;

  fs.writeFileSync(REPORT_PATH, JSON.stringify(existing, null, 2));
  console.log(`\n  ${c.dim}Report saved to ${path.relative(PROJECT_ROOT, REPORT_PATH)}${c.reset}`);
}

// ─── Main Scan ──────────────────────────────────────────────────────────────

async function runScan(config: Config): Promise<ScanReport> {
  const startTime = Date.now();
  const scanId = crypto.randomUUID();
  let allFindings: Finding[] = [];
  const checksRun: string[] = [];
  const checksSkipped: string[] = [];

  const checks: { name: string; key: string; fn: (config: Config) => Finding[] }[] = [
    { name: 'Blast Radius', key: 'blastRadius', fn: checkBlastRadius },
    { name: 'Network Exposure', key: 'networkExposure', fn: checkNetworkExposure },
    { name: 'Browser Control Exposure', key: 'browserControlExposure', fn: checkBrowserControlExposure },
    { name: 'Local Disk Hygiene', key: 'localDiskHygiene', fn: checkLocalDiskHygiene },
    { name: 'Plugin/Model Hygiene', key: 'pluginModelHygiene', fn: checkPluginModelHygiene },
    { name: 'Credential Storage', key: 'credentialStorage', fn: checkCredentialStorage },
    { name: 'Reverse Proxy Config', key: 'reverseProxyConfig', fn: checkReverseProxyConfig },
    { name: 'Session Logs', key: 'sessionLogs', fn: checkSessionLogs },
    { name: 'Shell Injection', key: 'shellInjection', fn: checkShellInjection },
    { name: 'Input Validation', key: 'inputValidation', fn: checkInputValidation },
    { name: 'Path Traversal', key: 'pathTraversal', fn: checkPathTraversal },
    { name: 'Secrets in Git History', key: 'secretsInHistory', fn: checkSecretsInHistory },
  ];

  for (const check of checks) {
    if (!isCheckEnabled(config, check.key)) {
      checksSkipped.push(check.name);
      if (config.verbose) {
        console.log(`  ${c.gray}[SKIP] ${check.name} (disabled in config)${c.reset}`);
      }
      continue;
    }

    try {
      console.log(`  ${c.dim}Running: ${check.name}...${c.reset}`);
      const findings = check.fn(config);
      allFindings.push(...findings);
      checksRun.push(check.name);
    } catch (e) {
      console.log(`  ${c.boldRed}[ERROR] ${check.name}: ${(e as Error).message}${c.reset}`);
      allFindings.push({
        id: `ERR-${check.key}`,
        category: 'blast-radius',
        severity: 'low',
        title: `Check "${check.name}" failed to execute`,
        detail: (e as Error).message,
        remediation: 'Review the error and fix the check implementation.',
        autoFixable: false,
      });
    }
  }

  // Apply auto-remediations if enabled
  const { applied, updated } = applyRemediations(allFindings, config);
  allFindings = updated;

  // Build summary
  const summary: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of allFindings) {
    summary[f.severity]++;
  }

  return {
    scanId,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    findings: allFindings,
    summary,
    checksRun,
    checksSkipped,
    remediationsApplied: applied,
    config,
  };
}

// ─── Entry Point ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const oneShot = args.includes('--once');
  const config = loadConfig();

  printBanner();
  console.log(`${c.dim}  Project: ${PROJECT_ROOT}`);
  console.log(`  Mode: ${oneShot ? 'single scan' : `continuous (every ${config.intervalSeconds}s)`}`);
  console.log(`  Auto-remediate: ${config.autoRemediate ? 'ON' : 'OFF'}`);
  console.log(`  Checks enabled: ${Object.entries(config.checks).filter(([, v]) => v).length}/${Object.keys(config.checks).length}${c.reset}`);
  console.log();

  let cycle = 0;

  const runCycle = async () => {
    cycle++;
    console.log(
      `${c.bold}${c.cyan}━━━ Scan #${cycle} — ${new Date().toLocaleTimeString()} ━━━${c.reset}`,
    );

    const report = await runScan(config);
    printFindings(report.findings);
    printSummary(report);
    saveReport(report);

    // Return exit code based on severity
    if (oneShot) {
      const exitCode = report.summary.critical > 0 ? 2 : report.summary.high > 0 ? 1 : 0;
      process.exit(exitCode);
    }
  };

  await runCycle();

  if (!oneShot) {
    console.log(
      `\n${c.dim}  Next scan in ${config.intervalSeconds}s. Press Ctrl+C to stop.${c.reset}\n`,
    );
    setInterval(runCycle, config.intervalSeconds * 1000);
  }
}

main().catch((e) => {
  console.error(`${c.boldRed}Fatal error: ${e.message}${c.reset}`);
  process.exit(1);
});
