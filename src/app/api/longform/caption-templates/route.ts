/**
 * GET /api/longform/caption-templates
 *
 * List available Submagic caption templates.
 * Cached in Redis (30 min TTL) since templates rarely change.
 */

import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { listTemplates } from '@/lib/submagic';
import { getRedis } from '@/lib/redis';

const CACHE_KEY = 'cache:submagic:templates';
const CACHE_TTL = 1800; // 30 minutes

export async function GET() {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;

  // Check cache
  const redis = getRedis();
  if (redis) {
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) {
        return NextResponse.json({ templates: JSON.parse(cached) });
      }
    } catch { /* ignore */ }
  }

  if (!process.env.SUBMAGIC_API_KEY) {
    return NextResponse.json({ error: 'Submagic not configured' }, { status: 503 });
  }

  try {
    const templates = await listTemplates();

    if (redis) {
      redis.set(CACHE_KEY, JSON.stringify(templates), 'EX', CACHE_TTL).catch(() => {});
    }

    return NextResponse.json({ templates });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to fetch templates' },
      { status: 500 },
    );
  }
}
