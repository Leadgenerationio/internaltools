import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { getTransactionHistory } from '@/lib/token-balance';

export async function GET(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId, role } = authResult.auth;

  if (role !== 'OWNER' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const url = new URL(request.url);
  const page = Math.max(Number(url.searchParams.get('page')) || 1, 1);
  const pageSize = Math.min(Math.max(Number(url.searchParams.get('pageSize')) || 20, 5), 100);

  try {
    const result = await getTransactionHistory(companyId, { page, pageSize });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Transactions API error:', error);
    return NextResponse.json({ error: 'Failed to load transactions' }, { status: 500 });
  }
}
