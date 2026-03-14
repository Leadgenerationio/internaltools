/**
 * Storyblocks API v2 client.
 *
 * Uses HMAC-SHA256 auth with public/private key pair.
 * Env vars: STORYBLOCKS_PUBLIC_KEY, STORYBLOCKS_PRIVATE_KEY
 *
 * Auth: Every request needs APIKEY, EXPIRES, HMAC query params,
 * plus user_id and project_id for tracking.
 * HMAC = SHA256(resourcePath, key = privateKey + expiresTimestamp)
 *
 * Response format:
 *   { results: [...], total_results: number, search_identifiers: {...} }
 *   Each result has: id, title, thumbnail_url, preview_urls: { _180p, _360p, _480p, _720p }, duration
 */

import crypto from 'crypto';

const BASE_URL = 'https://api.storyblocks.com';

function getKeys() {
  const publicKey = process.env.STORYBLOCKS_PUBLIC_KEY;
  const privateKey = process.env.STORYBLOCKS_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error('Storyblocks API keys not configured');
  return { publicKey, privateKey };
}

/**
 * Generate HMAC auth params for a given resource path.
 */
function generateAuth(resourcePath: string) {
  const { publicKey, privateKey } = getKeys();
  const expires = Math.floor(Date.now() / 1000) + 12 * 60 * 60;

  const hmac = crypto.createHmac('sha256', privateKey + expires);
  hmac.update(resourcePath);

  return {
    APIKEY: publicKey,
    EXPIRES: String(expires),
    HMAC: hmac.digest('hex'),
  };
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface StoryblocksSearchResult {
  id: number;
  title: string;
  type: string;
  duration: number;
  thumbnail_url: string;
  preview_urls?: Record<string, string>;
  keywords: string | string[];
}

export interface StoryblocksSearchResponse {
  results: StoryblocksSearchResult[];
  totalResults: number;
}

export async function searchVideos(
  keywords: string,
  page = 1,
  numResults = 20,
): Promise<StoryblocksSearchResponse> {
  const resourcePath = '/api/v2/videos/search';
  const auth = generateAuth(resourcePath);

  const params = new URLSearchParams({
    ...auth,
    keywords,
    page: String(page),
    num_results: String(numResults),
    content_type: 'footage',
    user_id: 'admaker',
    project_id: 'admaker',
  });

  const res = await fetch(`${BASE_URL}${resourcePath}?${params}`, {
    headers: { 'User-Agent': 'AdMaker/1.0' },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Storyblocks search failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json();

  const results = data.results || [];
  const totalResults = data.total_results ?? 0;

  return { results, totalResults };
}

// ─── Download URL ────────────────────────────────────────────────────────────

/**
 * Get a signed download URL for a stock video.
 * The URL expires after ~20 minutes.
 */
export async function getDownloadUrl(stockItemId: number): Promise<string> {
  const resourcePath = `/api/v2/videos/stock-item/download/${stockItemId}`;
  const auth = generateAuth(resourcePath);

  const params = new URLSearchParams({
    ...auth,
    user_id: 'admaker',
    project_id: 'admaker',
  });

  const res = await fetch(`${BASE_URL}${resourcePath}?${params}`, {
    headers: { 'User-Agent': 'AdMaker/1.0' },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Storyblocks download failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json();

  // Response format: { MP4: { _720p: "url", _1080p: "url" }, MOV: {...} }
  // Prefer MP4 720p for best compatibility and reasonable size
  const url = data.MP4?.['_720p']
    || data.MP4?.['_1080p']
    || data.MP4?.['_2160p']
    || data.MOV?.['_1080p']
    || data.url
    || data.info?.url;
  if (!url) {
    throw new Error('Storyblocks returned no download URL');
  }
  return url;
}
