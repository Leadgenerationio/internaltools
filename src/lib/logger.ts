import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';
import os from 'os';

const LOG_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true, mode: 0o750 });
}

// ─── Log Sanitization ──────────────────────────────────────────────────────

const SECRET_PATTERNS = [
  /sk-ant-api\w{2}-[\w-]{20,}/g,    // Anthropic
  /AIzaSy[\w-]{33}/g,               // Google
  /sk-[a-zA-Z0-9]{48,}/g,           // OpenAI
  /ghp_[a-zA-Z0-9]{36}/g,           // GitHub PAT
  /Bearer\s+[a-zA-Z0-9._-]{20,}/g,  // Bearer tokens
  /AKIA[0-9A-Z]{16}/g,              // AWS
];

const HOME_DIR = os.homedir();

function sanitizeValue(value: string): string {
  let result = value;

  // Redact known secret patterns
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }

  // Replace home directory paths with ~
  if (HOME_DIR && result.includes(HOME_DIR)) {
    result = result.replaceAll(HOME_DIR, '~');
  }

  return result;
}

function sanitizeMeta(meta: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(meta)) {
    // Skip fields that could contain secrets
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('password') || lowerKey.includes('secret') || lowerKey.includes('token') || lowerKey.includes('apikey') || lowerKey.includes('api_key')) {
      clean[key] = '[REDACTED]';
      continue;
    }

    if (typeof value === 'string') {
      clean[key] = sanitizeValue(value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      clean[key] = value;
    } else if (value === null || value === undefined) {
      clean[key] = value;
    } else if (typeof value === 'object') {
      // For nested objects, JSON-stringify and sanitize the result
      try {
        clean[key] = sanitizeValue(JSON.stringify(value));
      } catch {
        clean[key] = '[unserializable]';
      }
    } else {
      clean[key] = String(value);
    }
  }
  return clean;
}

// ─── Format ─────────────────────────────────────────────────────────────────

const sanitizedFormat = winston.format((info) => {
  // Sanitize the message
  if (typeof info.message === 'string') {
    info.message = sanitizeValue(info.message);
  }

  // Sanitize stack traces
  if (typeof info.stack === 'string') {
    info.stack = sanitizeValue(info.stack);
  }

  // Sanitize any extra metadata
  const reserved = new Set(['level', 'message', 'timestamp', 'stack', 'service']);
  const metaKeys = Object.keys(info).filter((k) => !reserved.has(k));
  if (metaKeys.length > 0) {
    const meta: Record<string, any> = {};
    for (const k of metaKeys) {
      meta[k] = info[k];
    }
    const sanitized = sanitizeMeta(meta);
    for (const k of metaKeys) {
      info[k] = sanitized[k];
    }
  }

  return info;
});

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  sanitizedFormat(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    const stackStr = stack ? `\n${stack}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}${stackStr}`;
  })
);

// ─── Transports ─────────────────────────────────────────────────────────────

const rotateTransport = new DailyRotateFile({
  filename: path.join(LOG_DIR, 'app-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: logFormat,
});

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
  format: logFormat,
  transports: [
    new winston.transports.Console({ format: winston.format.simple() }),
    rotateTransport,
  ],
});
