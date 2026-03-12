/**
 * Convert a public-relative file path to a URL that works in production.
 *
 * Next.js standalone mode does NOT serve runtime-generated files from public/.
 * We route all file access through /api/files which reads from disk and falls
 * back to S3 when the file isn't on local disk.
 *
 * When CDN_URL is explicitly set (implies a public CDN is configured), returns
 * direct CDN URLs to offload file serving from Node.js.
 *
 * S3_PUBLIC_URL alone does NOT trigger direct URLs — Supabase/S3 buckets may
 * be private. Files are served via /api/files which proxies from S3 as needed.
 *
 * Example:
 *   fileUrl('uploads/abc.mp4') => '/api/files?path=uploads/abc.mp4'       (default)
 *   fileUrl('uploads/abc.mp4') => 'https://cdn.example.com/uploads/abc.mp4' (with CDN_URL)
 */

const CDN_URL = process.env.CDN_URL;

export function fileUrl(publicPath: string): string {
  const clean = publicPath.replace(/^\/+/, '');

  if (CDN_URL) {
    const base = CDN_URL.replace(/\/+$/, '');
    return `${base}/${clean}`;
  }

  return `/api/files?path=${encodeURIComponent(clean)}`;
}
