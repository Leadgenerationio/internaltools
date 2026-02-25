import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

const VALID_LEVELS = ['error', 'warn', 'info', 'debug'] as const;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { level = 'info', message, ...meta } = body;
    const safeLevel = VALID_LEVELS.includes(level as any) ? level : 'info';
    (logger as any)[safeLevel]?.(message, meta);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Log failed' }, { status: 500 });
  }
}
