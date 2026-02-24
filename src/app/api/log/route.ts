import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { level = 'info', message, ...meta } = body;
    (logger as any)[level]?.(message, meta);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Log failed' }, { status: 500 });
  }
}
