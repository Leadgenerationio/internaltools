'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';

interface UsageData {
  monthlyTotalCents: number;
  monthlyBudgetCents: number | null;
  plan: string;
  byService: { service: string; totalCents: number }[];
  byUser: { userId: string; name: string; totalCents: number; callCount: number }[];
  daily: { date: string; service: string; totalCents: number }[];
  recentCalls: {
    id: string;
    service: string;
    endpoint: string;
    model: string;
    costCents: number;
    inputTokens: number | null;
    outputTokens: number | null;
    videoCount: number | null;
    success: boolean;
    durationMs: number | null;
    createdAt: string;
    userName: string;
  }[];
}

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

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
  const [totalPages, setTotalPages] = useState(1);
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
        else {
          setData(d);
          if (d.pagination) setTotalPages(d.pagination.totalPages);
        }
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

  const anthropicCents = data.byService.find((s) => s.service === 'ANTHROPIC')?.totalCents || 0;
  const veoCents = data.byService.find((s) => s.service === 'GOOGLE_VEO')?.totalCents || 0;
  const budgetPct = data.monthlyBudgetCents
    ? Math.min((data.monthlyTotalCents / data.monthlyBudgetCents) * 100, 100)
    : null;

  return (
    <main className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-white text-sm">&larr; Back</Link>
            <h1 className="text-xl font-bold text-white">Usage & Costs</h1>
          </div>
          <UserMenu />
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <p className="text-sm text-gray-400">This Month</p>
            <p className="text-3xl font-bold text-white mt-1">{formatPence(data.monthlyTotalCents)}</p>
            {budgetPct !== null && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Budget</span>
                  <span>{formatPence(data.monthlyBudgetCents!)}</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${budgetPct > 80 ? 'bg-red-500' : budgetPct > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                    style={{ width: `${budgetPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <p className="text-sm text-gray-400">Claude (Ad Copy)</p>
            <p className="text-2xl font-bold text-white mt-1">{formatPence(anthropicCents)}</p>
          </div>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <p className="text-sm text-gray-400">Veo (Video Gen)</p>
            <p className="text-2xl font-bold text-white mt-1">{formatPence(veoCents)}</p>
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
                a.download = `usage-${days}d.csv`;
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

        {/* By User */}
        {data.byUser.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">By User</h2>
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">User</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">Calls</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byUser.map((u) => (
                    <tr key={u.userId} className="border-b border-gray-700/50">
                      <td className="px-4 py-3 text-white">{u.name}</td>
                      <td className="px-4 py-3 text-gray-300 text-right">{u.callCount}</td>
                      <td className="px-4 py-3 text-white text-right font-medium">{formatPence(u.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Recent Calls */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Recent API Calls</h2>
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Time</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Service</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Endpoint</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">User</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Tokens</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Cost</th>
                  <th className="text-center px-4 py-3 text-gray-400 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentCalls.map((c) => (
                  <tr key={c.id} className="border-b border-gray-700/50">
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{formatDate(c.createdAt)}</td>
                    <td className="px-4 py-3 text-white">{c.service === 'ANTHROPIC' ? 'Claude' : 'Veo'}</td>
                    <td className="px-4 py-3 text-gray-300">{c.endpoint}</td>
                    <td className="px-4 py-3 text-gray-300">{c.userName}</td>
                    <td className="px-4 py-3 text-gray-300 text-right whitespace-nowrap">
                      {c.inputTokens !== null ? `${c.inputTokens} / ${c.outputTokens}` : c.videoCount ? `${c.videoCount} video(s)` : '-'}
                    </td>
                    <td className="px-4 py-3 text-white text-right font-medium">{formatPence(c.costCents)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block w-2 h-2 rounded-full ${c.success ? 'bg-green-500' : 'bg-red-500'}`} />
                    </td>
                  </tr>
                ))}
                {data.recentCalls.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No API calls yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 text-sm rounded-lg border border-gray-700 transition-colors"
              >
                Previous
              </button>
              <span className="text-sm text-gray-400">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
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
