import { NextResponse } from 'next/server';
import { getAuthContext, AuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

/**
 * Check if an email is in the SUPER_ADMIN_EMAILS list.
 */
export function isSuperAdmin(email: string): boolean {
  const allowed = (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

/**
 * Get authenticated super admin context.
 * Returns auth context or a 403 error response.
 */
export async function getSuperAdminContext(): Promise<
  { auth: AuthContext; error?: never } | { auth?: never; error: NextResponse }
> {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult;

  if (!isSuperAdmin(authResult.auth.email)) {
    return {
      error: NextResponse.json(
        { error: 'Forbidden — super admin access required' },
        { status: 403 }
      ),
    };
  }

  return authResult;
}

/**
 * Log an admin action to the audit log.
 */
export async function logAdminAction(params: {
  adminUserId: string;
  action: 'GRANT_TOKENS' | 'CHANGE_PLAN' | 'SUSPEND' | 'UNSUSPEND' | 'IMPERSONATE' | 'ADJUST_BALANCE';
  targetCompanyId?: string;
  targetUserId?: string;
  details: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminUserId: params.adminUserId,
        action: params.action,
        targetCompanyId: params.targetCompanyId || null,
        targetUserId: params.targetUserId || null,
        details: params.details,
      },
    });
  } catch (err) {
    // Audit logging should never break the operation — log and continue
    console.error('Failed to write admin audit log:', err);
  }
}
