'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import Tooltip from '@/components/Tooltip';

interface UsageData {
  tokenBalance: number;
  monthlyTokensUsed: number;
  monthlyAllocation: number;
  monthlyTokenBudget: number | null;
  plan: string;
  byReason: { reason: string; totalTokens: number }[];
  byUser: { userId: string; name: string; totalTokens: number; operationCount: number }[];
  recentTransactions: {
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    reason: string;
    description: string | null;
    userName: string;
    createdAt: string;
  }[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

const REASON_LABELS: Record<string, string> = {
  RENDER: 'Video Renders',
  GENERATE_VIDEO: 'AI Video Generation',
  GENERATE_ADS: 'Ad Copy Generation',
  PLAN_ALLOCATION: 'Plan Allocation',
  TOPUP_PURCHASE: 'Top-up Purchase',
  ADMIN_GRANT: 'Admin Grant',
  REFUND: 'Refund',
  EXPIRY: 'Expired',
  ADJUSTMENT: 'Adjustment',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function UsagePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    if (status !== 'authenticated') return;

    const isAdmin = session?.user?.role === 'OWNER' || session?.user?.role === 'ADMIN';
    if (!isAdmin) {
      router.push('/');
      return;
    }

    setLoading(true);
    fetch(`/api/usage?days=${days}&page=${page}&pageSize=50`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError('Failed to load usage data'))
      .finally(() => setLoading(false));
  }, [status, session, router, days, page]);

  if (status === 'loading' || loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  if (!data) return null;

  const usagePct = data.monthlyAllocation > 0
    ? Math.min((data.monthlyTokensUsed / data.monthlyAllocation) * 100, 100)
    : 0;

  const budgetPct = data.monthlyTokenBudget
    ? Math.min((data.monthlyTokensUsed / data.monthlyTokenBudget) * 100, 100)
    : null;

  return (
    <main className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 px-4 sm:px-6 py-3 sm:py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <Link href="/" className="text-gray-400 hover:text-white text-sm">&larr; Back</Link>
            <h1 className="text-lg sm:text-xl font-bold text-white">Token Usage</h1>
          </div>
          <UserMenu />
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <p className="text-sm text-gray-400">Token Balance</p>
            <p className="text-3xl font-bold text-white mt-1">{data.tokenBalance.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1">{data.plan} plan</p>
          </div>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <p className="text-sm text-gray-400">Used This Month</p>
            <p className="text-3xl font-bold text-white mt-1">
              {data.monthlyTokensUsed.toLocaleString()}
              <span className="text-sm font-normal text-gray-500 ml-1">
                / {data.monthlyAllocation.toLocaleString()}
              </span>
            </p>
            <div className="mt-3">
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${usagePct > 80 ? 'bg-red-500' : usagePct > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${usagePct}%` }}
                />
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <p className="text-sm text-gray-400 flex items-center">
              Monthly Budget
              <Tooltip text="Optional spending cap set by your team owner. Operations will be blocked when this limit is reached." />
            </p>
            {budgetPct !== null ? (
              <>
                <p className="text-3xl font-bold text-white mt-1">{data.monthlyTokenBudget!.toLocaleString()}</p>
                <div className="mt-3">
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${budgetPct > 80 ? 'bg-red-500' : budgetPct > 50 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                      style={{ width: `${budgetPct}%` }}
                    />
                  </div>
                </div>
              </>
            ) : (
              <p className="text-2xl font-bold text-gray-500 mt-1">No limit</p>
            )}
          </div>
        </div>

        {/* Time Period Selector + Export */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-2">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => { setDays(d); setPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  days === d
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
          <button
            onClick={async () => {
              setExporting(true);
              try {
                const res = await fetch(`/api/usage/export?days=${days}`);
                if (!res.ok) throw new Error('Export failed');
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `token-usage-${days}d.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              } catch (err) {
                console.error('Export error:', err);
              } finally {
                setExporting(false);
              }
            }}
            disabled={exporting}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 text-sm rounded-lg border border-gray-700 transition-colors"
          >
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>

        {/* Usage By Reason */}
        {data.byReason.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-3 flex items-center">
              Usage By Type
              <Tooltip text="Breakdown of how your tokens were spent this month — video renders, AI generation, and other operations." />
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {data.byReason.map((r) => (
                <div key={r.reason} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                  <p className="text-sm text-gray-400">{REASON_LABELS[r.reason] || r.reason}</p>
                  <p className="text-2xl font-bold text-white mt-1">{r.totalTokens.toLocaleString()} tokens</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* By User */}
        {data.byUser.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">By User</h2>
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">User</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">Operations</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">Tokens Used</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byUser.map((u) => (
                    <tr key={u.userId} className="border-b border-gray-700/50">
                      <td className="px-4 py-3 text-white">{u.name}</td>
                      <td className="px-4 py-3 text-gray-300 text-right">{u.operationCount}</td>
                      <td className="px-4 py-3 text-white text-right font-medium">{u.totalTokens.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Recent Transactions */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Transaction History</h2>
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Time</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Type</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Reason</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">User</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Tokens</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.recentTransactions.map((t) => (
                  <tr key={t.id} className="border-b border-gray-700/50">
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{formatDate(t.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        t.type === 'CREDIT' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                      }`}>
                        {t.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{REASON_LABELS[t.reason] || t.reason}</td>
                    <td className="px-4 py-3 text-gray-300">{t.userName}</td>
                    <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                      <span className={t.type === 'CREDIT' ? 'text-green-400' : 'text-red-400'}>
                        {t.type === 'CREDIT' ? '+' : '-'}{t.amount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white text-right font-medium">{t.balanceAfter.toLocaleString()}</td>
                  </tr>
                ))}
                {data.recentTransactions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No transactions yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 text-sm rounded-lg border border-gray-700 transition-colors"
              >
                Previous
              </button>
              <span className="text-sm text-gray-400">
                Page {data.pagination.page} of {data.pagination.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(data!.pagination.totalPages, p + 1))}
                disabled={page >= data.pagination.totalPages}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 text-sm rounded-lg border border-gray-700 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
