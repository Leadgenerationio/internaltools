/**
 * Check if a user email is in the SUPER_ADMIN_EMAILS env var.
 * Used across admin API routes for access control.
 */
export function isSuperAdmin(email: string): boolean {
  const allowed = (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}
