'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';

interface TicketSummary {
  id: string;
  ticketNumber: number;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  userName: string;
  messageCount: number;
  lastMessageAt: string;
  lastMessageIsStaff: boolean;
}

interface Pagination {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

type FilterTab = 'ALL' | 'OPEN' | 'RESOLVED' | 'CLOSED';

const FILTER_TABS: { key: FilterTab; label: string; statuses: string }[] = [
  { key: 'ALL', label: 'All', statuses: '' },
  { key: 'OPEN', label: 'Open', statuses: 'OPEN,IN_PROGRESS,WAITING_ON_CUSTOMER' },
  { key: 'RESOLVED', label: 'Resolved', statuses: 'RESOLVED' },
  { key: 'CLOSED', label: 'Closed', statuses: 'CLOSED' },
];

function statusBadge(status: string): string {
  switch (status) {
    case 'OPEN': return 'bg-blue-900/50 text-blue-400';
    case 'IN_PROGRESS': return 'bg-yellow-900/50 text-yellow-400';
    case 'WAITING_ON_CUSTOMER': return 'bg-orange-900/50 text-orange-400';
    case 'RESOLVED': return 'bg-green-900/50 text-green-400';
    case 'CLOSED': return 'bg-gray-700 text-gray-400';
    default: return 'bg-gray-700 text-gray-400';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'OPEN': return 'Open';
    case 'IN_PROGRESS': return 'In Progress';
    case 'WAITING_ON_CUSTOMER': return 'Waiting on You';
    case 'RESOLVED': return 'Resolved';
    case 'CLOSED': return 'Closed';
    default: return status;
  }
}

function priorityBadge(priority: string): string {
  switch (priority) {
    case 'LOW': return 'bg-gray-700 text-gray-400';
    case 'NORMAL': return 'bg-blue-900/50 text-blue-400';
    case 'HIGH': return 'bg-orange-900/50 text-orange-400';
    case 'URGENT': return 'bg-red-900/50 text-red-400';
    default: return 'bg-gray-700 text-gray-400';
  }
}

function categoryBadge(category: string): string {
  switch (category) {
    case 'BILLING': return 'bg-purple-900/50 text-purple-400';
    case 'TECHNICAL': return 'bg-blue-900/50 text-blue-400';
    case 'FEATURE_REQUEST': return 'bg-green-900/50 text-green-400';
    case 'ACCOUNT': return 'bg-yellow-900/50 text-yellow-400';
    case 'OTHER': return 'bg-gray-700 text-gray-400';
    default: return 'bg-gray-700 text-gray-400';
  }
}

function categoryLabel(category: string): string {
  switch (category) {
    case 'BILLING': return 'Billing';
    case 'TECHNICAL': return 'Technical';
    case 'FEATURE_REQUEST': return 'Feature Request';
    case 'ACCOUNT': return 'Account';
    case 'OTHER': return 'Other';
    default: return category;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export default function TicketsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const fetchTickets = useCallback(async (pageNum: number, tab: FilterTab) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError('');

    try {
      const tabConfig = FILTER_TABS.find((t) => t.key === tab);
      const statusParam = tabConfig?.statuses ? `&status=${tabConfig.statuses}` : '';
      const res = await fetch(`/api/tickets?page=${pageNum}&pageSize=20${statusParam}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load tickets');
      }
      const data = await res.json();
      setTickets(data.tickets);
      setPagination(data.pagination);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetchTickets(page, activeTab);
  }, [status, page, activeTab, fetchTickets]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleTabChange = (tab: FilterTab) => {
    setActiveTab(tab);
    setPage(1);
  };

  if (status === 'loading') {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </main>
    );
  }

  if (status === 'unauthenticated') return null;

  return (
    <main className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-white text-sm">
              &larr; Back
            </Link>
            <h1 className="text-xl font-bold text-white">Support Tickets</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/tickets/new"
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              + New Ticket
            </Link>
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-xl text-red-300 text-sm">
            {error}
            <button
              onClick={() => setError('')}
              className="ml-3 text-red-400 hover:text-red-200 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-800/50 rounded-lg p-1 w-fit">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.key
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading && tickets.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <p className="text-gray-400">Loading tickets...</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">
              {activeTab === 'ALL' ? 'No support tickets yet' : `No ${activeTab.toLowerCase()} tickets`}
            </h2>
            <p className="text-gray-400 text-sm mb-6 max-w-md">
              {activeTab === 'ALL'
                ? 'Need help? Create a ticket and our support team will get back to you.'
                : 'No tickets match this filter.'}
            </p>
            {activeTab === 'ALL' && (
              <Link
                href="/tickets/new"
                className="px-5 py-2.5 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition-colors"
              >
                Create Your First Ticket
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Tickets Table */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">#</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Subject</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium hidden md:table-cell">Category</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium hidden lg:table-cell">Priority</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium hidden sm:table-cell">Messages</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      onClick={() => router.push(`/tickets/${ticket.id}`)}
                      className="border-b border-gray-700/50 hover:bg-gray-700/30 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                        {ticket.ticketNumber}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium truncate max-w-[200px] sm:max-w-[300px]">
                            {ticket.subject}
                          </span>
                          {ticket.lastMessageIsStaff && (
                            <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400 font-medium">
                              Staff reply
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryBadge(ticket.category)}`}>
                          {categoryLabel(ticket.category)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(ticket.status)}`}>
                          {statusLabel(ticket.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityBadge(ticket.priority)}`}>
                          {ticket.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-right hidden sm:table-cell">
                        {ticket.messageCount}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-right text-xs whitespace-nowrap">
                        {timeAgo(ticket.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 text-sm rounded-lg border border-gray-700 transition-colors"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-400">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 text-sm rounded-lg border border-gray-700 transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
