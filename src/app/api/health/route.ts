import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const checks: Record<string, string> = {};

  // Database
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    checks.database = 'ok';
  } catch {
    checks.database = 'fail';
  }

  // FFmpeg
  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    await promisify(execFile)('ffmpeg', ['-version']);
    checks.ffmpeg = 'ok';
  } catch {
    checks.ffmpeg = 'fail';
  }

  const allOk = Object.values(checks).every((v) => v === 'ok');

  return NextResponse.json(
    { status: allOk ? 'healthy' : 'degraded', checks },
    { status: allOk ? 200 : 503 }
  );
}
