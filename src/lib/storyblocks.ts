/**
 * Storyblocks API v2 client.
 *
 * Uses HMAC-SHA256 auth with public/private key pair.
 * Env vars: STORYBLOCKS_PUBLIC_KEY, STORYBLOCKS_PRIVATE_KEY
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
  preview_urls: Record<string, string>;
  categories: string[];
  keywords: string[];
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
  });

  const res = await fetch(`${BASE_URL}${resourcePath}?${params}`, {
    headers: { 'User-Agent': 'AdMaker/1.0' },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Storyblocks search failed (${res.status}): ${body}`);
  }

  return res.json();
}

// ─── Download URL ────────────────────────────────────────────────────────────

export interface StoryblocksDownloadResponse {
  url: string;
}

/**
 * Get a signed download URL for a stock video.
 * The URL expires after ~20 minutes.
 */
export async function getDownloadUrl(stockItemId: number): Promise<string> {
  const resourcePath = `/api/v2/videos/stock-item/download/${stockItemId}`;
  const auth = generateAuth(resourcePath);

  const params = new URLSearchParams({
    ...auth,
  });

  const res = await fetch(`${BASE_URL}${resourcePath}?${params}`, {
    headers: { 'User-Agent': 'AdMaker/1.0' },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Storyblocks download failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data.url;
}
