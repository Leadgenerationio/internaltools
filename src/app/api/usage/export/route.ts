import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId, role } = authResult.auth;

  if (role !== 'OWNER' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const url = new URL(request.url);
  const days = Math.min(Number(url.searchParams.get('days')) || 30, 365);

  const since = new Date();
  since.setDate(since.getDate() - days);

  try {
    const transactions = await prisma.tokenTransaction.findMany({
      where: { companyId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true, email: true } } },
    });

    const headers = [
      'Date',
      'User',
      'Type',
      'Tokens',
      'Balance After',
      'Reason',
      'Description',
    ];

    const rows = transactions.map((t: any) => [
      new Date(t.createdAt).toISOString(),
      t.user?.name || t.user?.email || 'System',
      t.type,
      t.type === 'DEBIT' ? `-${t.amount}` : `+${t.amount}`,
      t.balanceAfter,
      t.reason,
      t.description || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row: any[]) =>
        row.map((cell: any) => {
          const str = String(cell);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        }).join(',')
      ),
    ].join('\n');

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="token-usage-${days}d-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error: any) {
    console.error('Usage export error:', error);
    return NextResponse.json({ error: 'Failed to export usage data' }, { status: 500 });
  }
}
