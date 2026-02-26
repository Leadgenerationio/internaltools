'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';

interface CompanyData {
  id: string;
  name: string;
  plan: string;
  userCount: number;
  monthlySpendPence: number;
  totalSpendPence: number;
}

interface RecentCall {
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
  companyName: string;
}

interface AdminData {
  totalCompanies: number;
  totalUsers: number;
  monthlySpendPence: number;
  allTimeSpendPence: number;
  companies: CompanyData[];
  recentCalls: RecentCall[];
}

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function planBadgeClass(plan: string): string {
  switch (plan) {
    case 'ENTERPRISE':
      return 'bg-purple-900/50 text-purple-400';
    case 'PRO':
      return 'bg-blue-900/50 text-blue-400';
    case 'STARTER':
      return 'bg-green-900/50 text-green-400';
    default:
      return 'bg-gray-700 text-gray-300';
  }
}

export default function AdminDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accessDenied, setAccessDenied] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    if (status !== 'authenticated') return;

    // Abort any previous in-flight request
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError('');
    setAccessDenied(false);

    fetch('/api/admin', { signal: controller.signal })
      .then((r) => {
        if (r.status === 403) {
          setAccessDenied(true);
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError('Failed to load admin data');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [status, session, router]);

  if (status === 'loading' || loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </main>
    );
  }

  if (accessDenied) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-900/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white">Access Denied</h1>
          <p className="text-gray-400 text-sm">You do not have super admin privileges.</p>
          <Link href="/" className="inline-block px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors">
            Back to App
          </Link>
        </div>
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

  return (
    <main className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-white text-sm">&larr; Back</Link>
            <h1 className="text-xl font-bold text-white">Platform Admin</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/50 text-red-400 font-medium">
              Super Admin
            </span>
          </div>
          <UserMenu />
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <p className="text-sm text-gray-400">Total Companies</p>
            <p className="text-3xl font-bold text-white mt-1">{data.totalCompanies}</p>
          </div>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <p className="text-sm text-gray-400">Total Users</p>
            <p className="text-3xl font-bold text-white mt-1">{data.totalUsers}</p>
          </div>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <p className="text-sm text-gray-400">Revenue This Month</p>
            <p className="text-3xl font-bold text-white mt-1">{formatPence(data.monthlySpendPence)}</p>
          </div>

          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <p className="text-sm text-gray-400">All-Time Revenue</p>
            <p className="text-3xl font-bold text-white mt-1">{formatPence(data.allTimeSpendPence)}</p>
          </div>
        </div>

        {/* Companies Table */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Companies</h2>
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Company</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Plan</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Users</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">This Month</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">All-Time</th>
                </tr>
              </thead>
              <tbody>
                {data.companies.map((c) => (
                  <tr key={c.id} className="border-b border-gray-700/50">
                    <td className="px-4 py-3 text-white font-medium">{c.name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${planBadgeClass(c.plan)}`}>
                        {c.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-right">{c.userCount}</td>
                    <td className="px-4 py-3 text-white text-right font-medium">{formatPence(c.monthlySpendPence)}</td>
                    <td className="px-4 py-3 text-white text-right font-medium">{formatPence(c.totalSpendPence)}</td>
                  </tr>
                ))}
                {data.companies.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">No companies yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent API Calls */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Recent API Calls</h2>
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Time</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Company</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">User</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Service</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Cost</th>
                  <th className="text-center px-4 py-3 text-gray-400 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentCalls.map((c) => (
                  <tr key={c.id} className="border-b border-gray-700/50">
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{formatDate(c.createdAt)}</td>
                    <td className="px-4 py-3 text-white">{c.companyName}</td>
                    <td className="px-4 py-3 text-gray-300">{c.userName}</td>
                    <td className="px-4 py-3 text-white">
                      {c.service === 'ANTHROPIC' ? 'Claude' : c.service === 'GOOGLE_VEO' ? 'Veo' : c.service}
                    </td>
                    <td className="px-4 py-3 text-white text-right font-medium">{formatPence(c.costCents)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block w-2 h-2 rounded-full ${c.success ? 'bg-green-500' : 'bg-red-500'}`} />
                    </td>
                  </tr>
                ))}
                {data.recentCalls.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No API calls yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
