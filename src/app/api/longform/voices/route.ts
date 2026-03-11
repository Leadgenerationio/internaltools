/**
 * GET /api/longform/voices
 *
 * List available ElevenLabs voices for the voice picker.
 * Cached in Redis (5 min TTL) to avoid repeated API calls.
 */

import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { listVoices, listSharedVoices } from '@/lib/elevenlabs';
import { getRedis } from '@/lib/redis';

const CACHE_KEY = 'cache:elevenlabs:voices';
const CACHE_TTL = 300; // 5 minutes

export async function GET() {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;

  // Check cache first
  const redis = getRedis();
  if (redis) {
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) {
        return NextResponse.json({ voices: JSON.parse(cached) });
      }
    } catch { /* ignore */ }
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: 'ElevenLabs not configured' }, { status: 503 });
  }

  try {
    // Fetch user voices and popular shared voices in parallel
    const [userVoices, sharedVoices] = await Promise.all([
      listVoices(),
      listSharedVoices(100),
    ]);

    const simplify = (v: any) => ({
      id: v.voice_id,
      name: v.name,
      category: v.category || 'shared',
      previewUrl: v.preview_url,
      accent: v.labels?.accent || '',
      gender: v.labels?.gender || '',
      age: v.labels?.age || '',
    });

    // User voices first, then shared (deduplicated)
    const userIds = new Set(userVoices.map((v) => v.voice_id));
    const simplified = [
      ...userVoices.map(simplify),
      ...sharedVoices.filter((v) => !userIds.has(v.voice_id)).map(simplify),
    ];

    // Cache the result
    if (redis) {
      redis.set(CACHE_KEY, JSON.stringify(simplified), 'EX', CACHE_TTL).catch(() => {});
    }

    return NextResponse.json({ voices: simplified });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to fetch voices' },
      { status: 500 },
    );
  }
}
