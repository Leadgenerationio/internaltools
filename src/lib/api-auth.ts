import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export type AuthContext = {
  userId: string;
  companyId: string;
  role: string;
  email: string;
};

/**
 * Get authenticated user context from the session.
 * Returns auth context or an error response to send back.
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

  return {
    auth: {
      userId: session.user.id,
      companyId: session.user.companyId,
      role: session.user.role,
      email: session.user.email!,
    },
  };
}
