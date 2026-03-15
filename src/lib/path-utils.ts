/**
 * Shared utility for extracting public-relative file paths from various URL formats.
 *
 * Consolidates duplicated extractPublicPath() / extractStoragePath() functions
 * from render route, render worker, google-drive export, and longform finalize.
 *
 * Handles: /api/files URLs, CDN URLs, S3 URLs, Supabase URLs, relative paths.
 */

/**
 * Extract a public-relative path (e.g. "uploads/abc.mp4") from any URL format.
 *
 * Returns the best-effort extracted path. Callers should still validate
 * (e.g. `startsWith('uploads/')`) after calling.
 */
export function extractPublicPath(url: string): string {
  if (!url) return '';

  // 1. /api/files?path=uploads/abc.mp4 → uploads/abc.mp4
  if (url.includes('/api/files')) {
    try {
      const urlObj = new URL(url, 'http://localhost');
      const p = urlObj.searchParams.get('path');
      if (p) return p;
    } catch { /* fall through */ }
  }

  // 2. CDN URL: https://cdn.example.com/uploads/abc.mp4 → uploads/abc.mp4
  const cdnUrl = process.env.CDN_URL;
  if (cdnUrl && url.startsWith(cdnUrl)) {
    const stripped = url.slice(cdnUrl.replace(/\/+$/, '').length).replace(/^\/+/, '');
    if (stripped) return stripped;
  }

  // 3. S3_PUBLIC_URL: https://bucket.s3.amazonaws.com/uploads/abc.mp4 → uploads/abc.mp4
  const s3PublicUrl = process.env.S3_PUBLIC_URL;
  if (s3PublicUrl && url.startsWith(s3PublicUrl)) {
    const stripped = url.slice(s3PublicUrl.replace(/\/+$/, '').length).replace(/^\/+/, '');
    if (stripped) return stripped;
  }

  // 4. Supabase: .../object/public/{bucket}/uploads/abc.mp4 → uploads/abc.mp4
  const bucket = process.env.S3_BUCKET;
  if (bucket) {
    const pattern = `/object/public/${bucket}/`;
    const idx = url.indexOf(pattern);
    if (idx >= 0) {
      return url.slice(idx + pattern.length);
    }
  }

  // 5. Any URL containing a recognizable path segment (fallback for unknown CDNs)
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const match = url.match(/((?:uploads|outputs|music|longform)\/[^\s?#]+)/);
    if (match) return match[1];
  }

  // 6. Relative path starting with / → strip leading slash
  if (url.startsWith('/') && !url.startsWith('//')) {
    return url.slice(1);
  }

  // 7. Already a clean relative path (e.g. "uploads/abc.mp4")
  return url;
}
