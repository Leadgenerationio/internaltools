/**
 * GET /api/storyblocks/search?q=keyword&page=1
 *
 * Proxied search to Storyblocks API — keeps keys server-side.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { searchVideos } from '@/lib/storyblocks';

export async function GET(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));

  if (!q) {
    return NextResponse.json({ error: 'q parameter is required' }, { status: 400 });
  }

  if (!process.env.STORYBLOCKS_PUBLIC_KEY || !process.env.STORYBLOCKS_PRIVATE_KEY) {
    return NextResponse.json({ error: 'Storyblocks not configured' }, { status: 503 });
  }

  try {
    const data = await searchVideos(q, page, 20);

    // Simplify for client — handle both v1 (preview_url string) and v2 (preview_urls object) formats
    const results = (data.results || []).map((v: any) => ({
      id: v.id,
      title: v.title,
      duration: v.duration || 0,
      thumbnailUrl: v.thumbnail_url || '',
      previewUrl: v.preview_url
        || v.preview_urls?.['_360p'] || v.preview_urls?.['_480p'] || v.preview_urls?.['_720p']
        || (typeof v.preview_urls === 'string' ? v.preview_urls : '')
        || '',
    }));

    return NextResponse.json({
      results,
      totalResults: data.totalResults || 0,
      page,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Storyblocks search failed' },
      { status: 500 },
    );
  }
}
