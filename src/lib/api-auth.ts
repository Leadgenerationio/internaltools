import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export type AuthContext = {
  userId: string;
  companyId: string;
  role: string;
  email: string;
};

/**
 * Check if an email is in the SUPER_ADMIN_EMAILS list.
 * Used here to bypass suspension checks for super admins.
 */
function isSuperAdminEmail(email: string): boolean {
  const allowed = (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

/**
 * Get authenticated user context from the session.
 * Returns auth context or an error response to send back.
 *
 * Also checks if the user's company is suspended.
 * Super admins bypass the suspension check.
 */
export async function getAuthContext(): Promise<
  { auth: AuthContext; error?: never } | { auth?: never; error: NextResponse }
> {
  const session = await auth();

  if (!session?.user?.companyId) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const email = session.user.email!;

  // Check company suspension (skip for super admins)
  if (!isSuperAdminEmail(email)) {
    try {
      const company = await prisma.company.findUnique({
        where: { id: session.user.companyId },
        select: { suspended: true, suspendedReason: true },
      });

      if (company?.suspended) {
        return {
          error: NextResponse.json(
            {
              error: 'Account suspended',
              reason: company.suspendedReason || 'Your account has been suspended. Please contact support.',
              suspended: true,
            },
            { status: 403 }
          ),
        };
      }
    } catch {
      // If we can't check suspension status, allow the request through
      // rather than blocking legitimate users due to a transient DB error
    }
  }

  return {
    auth: {
      userId: session.user.id,
      companyId: session.user.companyId,
      role: session.user.role,
      email,
    },
  };
}
