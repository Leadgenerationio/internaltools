/**
 * Strip HTML tags from user input to prevent injection.
 * Used across ticket and admin routes for text sanitization.
 */
export function sanitizeHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim();
}
