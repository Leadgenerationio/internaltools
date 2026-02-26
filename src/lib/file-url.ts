/**
 * Convert a public-relative file path to a URL that works in production.
 *
 * Next.js standalone mode does NOT serve runtime-generated files from public/.
 * We route all file access through /api/files which reads from disk.
 *
 * Example: fileUrl('uploads/abc.mp4') => '/api/files?path=uploads/abc.mp4'
 */
export function fileUrl(publicPath: string): string {
  // Strip leading slash if present
  const clean = publicPath.replace(/^\/+/, '');
  return `/api/files?path=${encodeURIComponent(clean)}`;
}
