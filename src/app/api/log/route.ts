import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

const VALID_LEVELS = ['error', 'warn', 'info', 'debug'] as const;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_META_KEYS = 10;
const MAX_PAYLOAD_SIZE = 10_000; // 10KB

export async function POST(request: NextRequest) {
  try {
    // Check Content-Length before parsing
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_SIZE) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    const rawBody = await request.text();
    if (rawBody.length > MAX_PAYLOAD_SIZE) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Expected JSON object' }, { status: 400 });
    }

    const { level = 'info', message, ...meta } = body;

    // Validate message
    if (typeof message !== 'string' || message.length === 0) {
      return NextResponse.json({ error: 'Message is required and must be a string' }, { status: 400 });
    }

    const safeLevel = VALID_LEVELS.includes(level as any) ? level : 'info';
    const safeMessage = message.slice(0, MAX_MESSAGE_LENGTH);

    // Limit metadata keys and sanitize values
    const safeMeta: Record<string, unknown> = {};
    const metaKeys = Object.keys(meta).slice(0, MAX_META_KEYS);
    for (const key of metaKeys) {
      const val = meta[key];
      if (typeof val === 'string') {
        safeMeta[key] = val.slice(0, 500);
      } else if (typeof val === 'number' || typeof val === 'boolean') {
        safeMeta[key] = val;
      }
      // Skip objects, arrays, and other complex types from client logs
    }

    (logger as any)[safeLevel]?.(safeMessage, safeMeta);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Log failed' }, { status: 500 });
  }
}
