import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';

const JAMENDO_CLIENT_ID = process.env.JAMENDO_CLIENT_ID;
const JAMENDO_API = 'https://api.jamendo.com/v3.0';

/**
 * GET /api/music-library?q=upbeat&genre=pop&page=1
 * Search Jamendo's free music library.
 */
export async function GET(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;

  if (!JAMENDO_CLIENT_ID) {
    return NextResponse.json(
      { error: 'Music library not configured (missing JAMENDO_CLIENT_ID)' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';
  const genre = searchParams.get('genre') || '';
  const mood = searchParams.get('mood') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = 20;
  const offset = (page - 1) * limit;

  const params = new URLSearchParams({
    client_id: JAMENDO_CLIENT_ID,
    format: 'json',
    limit: String(limit),
    offset: String(offset),
    include: 'musicinfo',
    audioformat: 'mp32',
  });

  if (query) params.set('search', query);
  if (genre) params.set('tags', genre);
  if (mood) params.set('fuzzytags', mood);

  // Default sort: by popularity when no search query
  if (!query) {
    params.set('order', 'popularity_total');
    params.set('boost', 'popularity_total');
  }

  try {
    const res = await fetch(`${JAMENDO_API}/tracks/?${params}`, {
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to search music library' },
        { status: 502 }
      );
    }

    const data = await res.json();

    const tracks = (data.results || []).map((t: any) => ({
      id: String(t.id),
      name: t.name,
      artist: t.artist_name,
      duration: t.duration,
      previewUrl: t.audio, // streaming preview URL
      downloadUrl: t.audiodownload, // full download URL
      image: t.image,
      genre: t.musicinfo?.tags?.genres?.[0] || '',
      mood: t.musicinfo?.tags?.vartags?.[0] || '',
      license: t.license_ccurl || '',
    }));

    return NextResponse.json({
      tracks,
      total: data.headers?.results_count || 0,
      page,
      hasMore: tracks.length === limit,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Music library search failed' },
      { status: 500 }
    );
  }
}
