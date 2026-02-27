/**
 * Convert a public-relative file path to a URL that works in production.
 *
 * Next.js standalone mode does NOT serve runtime-generated files from public/.
 * We route all file access through /api/files which reads from disk.
 *
 * When CDN_URL is set, returns direct CDN URLs instead — offloads file serving
 * from Node.js entirely. The CDN should be configured to proxy to the origin.
 *
 * Example:
 *   fileUrl('uploads/abc.mp4') => '/api/files?path=uploads/abc.mp4'       (no CDN)
 *   fileUrl('uploads/abc.mp4') => 'https://cdn.example.com/uploads/abc.mp4' (with CDN)
 */

const CDN_URL = process.env.CDN_URL || process.env.S3_PUBLIC_URL;

export function fileUrl(publicPath: string): string {
  const clean = publicPath.replace(/^\/+/, '');

  if (CDN_URL) {
    const base = CDN_URL.replace(/\/+$/, '');
    return `${base}/${clean}`;
  }

  return `/api/files?path=${encodeURIComponent(clean)}`;
}
