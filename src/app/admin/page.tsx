'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import Tooltip from '@/components/Tooltip';

// ─── Types ──────────────────────────────────────────────────

type Tab = 'overview' | 'companies' | 'users' | 'transactions' | 'support';

interface OverviewData {
  totalCompanies: number;
  totalUsers: number;
  activeSubscriptions: number;
  monthlyRevenuePence: number;
  allTimeRevenuePence: number;
  monthlySpendPence: number;
  allTimeSpendPence: number;
  planDistribution: Record<string, number>;
  recentActivity: RecentActivity[];
}

interface RecentActivity {
  id: string;
  service: string;
  endpoint: string;
  model: string;
  costCents: number;
  tokensCost: number | null;
  success: boolean;
  durationMs: number | null;
  createdAt: string;
  userName: string;
  companyName: string;
}

interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  tokenBalance: number;
  suspended: boolean;
  suspendedAt: string | null;
  createdAt: string;
  stripeStatus: string;
  userCount: number;
  projectCount: number;
  monthlyTokensUsed: number;
}

interface CompanyDetail {
  id: string;
  name: string;
  slug: string;
  plan: string;
  tokenBalance: number;
  monthlyTokenBudget: number | null;
  suspended: boolean;
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  monthlyTokensUsed: number;
  totalRevenuePence: number;
  users: CompanyUser[];
  recentTransactions: TransactionRow[];
  _count: { projects: number; apiUsage: number; tokenTransactions: number };
}

interface CompanyUser {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
  lastLoginAt: string | null;
}

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
  lastLoginAt: string | null;
  companyId: string;
  companyName: string;
  companyPlan: string;
  companySuspended: boolean;
}

interface TransactionRow {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  description: string | null;
  createdAt: string;
  companyId?: string;
  companyName: string;
  userName: string;
}

// ─── Helpers ────────────────────────────────────────────────

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(iso: string): string {
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
      return 'bg-purple-900/50 text-purple-400 border-purple-800/50';
    case 'PRO':
      return 'bg-blue-900/50 text-blue-400 border-blue-800/50';
    case 'STARTER':
      return 'bg-green-900/50 text-green-400 border-green-800/50';
    default:
      return 'bg-gray-700/50 text-gray-300 border-gray-600/50';
  }
}

function roleBadgeClass(role: string): string {
  switch (role) {
    case 'OWNER':
      return 'bg-amber-900/50 text-amber-400';
    case 'ADMIN':
      return 'bg-blue-900/50 text-blue-400';
    default:
      return 'bg-gray-700 text-gray-300';
  }
}

function stripeBadge(status: string): { text: string; cls: string } {
  switch (status) {
    case 'active':
      return { text: 'Active', cls: 'bg-green-900/50 text-green-400' };
    case 'customer':
      return { text: 'Customer', cls: 'bg-yellow-900/50 text-yellow-400' };
    default:
      return { text: 'None', cls: 'bg-gray-700 text-gray-400' };
  }
}

// ─── Debounce Hook ──────────────────────────────────────────

function useDebounce(value: string, delay: number): string {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

// ─── Confirmation Modal ─────────────────────────────────────

function ConfirmModal({
  title,
  message,
  confirmLabel,
  confirmClass,
  requireTyping,
  typingTarget,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  confirmClass?: string;
  requireTyping?: boolean;
  typingTarget?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  const canConfirm = requireTyping ? typed === typingTarget : true;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-md w-full shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-300 mb-4">{message}</p>

        {requireTyping && typingTarget && (
          <div className="mb-4">
            <p className="text-xs text-gray-400 mb-2">
              Type <span className="font-mono text-red-400">{typingTarget}</span> to confirm:
            </p>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-red-500"
              placeholder={typingTarget}
              autoFocus
            />
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={`px-4 py-2 text-sm text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              confirmClass || 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Pagination Component ───────────────────────────────────

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-4 px-1">
      <p className="text-xs text-gray-400">
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ─── Search Input ───────────────────────────────────────────

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}

// ─── Tab Button ─────────────────────────────────────────────

function TabButton({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
        active
          ? 'bg-blue-600 text-white'
          : 'text-gray-400 hover:text-white hover:bg-gray-800'
      }`}
    >
      {label}
      {typeof count === 'number' && (
        <span
          className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
            active ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// ─── MAIN COMPONENT ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

export default function AdminDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Top-level state
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [accessDenied, setAccessDenied] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Overview
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [overviewError, setOverviewError] = useState('');

  // Companies
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [companiesTotal, setCompaniesTotal] = useState(0);
  const [companiesTotalPages, setCompaniesTotalPages] = useState(1);
  const [companiesPage, setCompaniesPage] = useState(1);
  const [companiesSearch, setCompaniesSearch] = useState('');
  const [companiesPlanFilter, setCompaniesPlanFilter] = useState('');
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [companyDetail, setCompanyDetail] = useState<CompanyDetail | null>(null);
  const [companyDetailLoading, setCompanyDetailLoading] = useState(false);

  // Users
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [usersPage, setUsersPage] = useState(1);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersRoleFilter, setUsersRoleFilter] = useState('');
  const [usersLoading, setUsersLoading] = useState(false);

  // Transactions
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [transactionsTotal, setTransactionsTotal] = useState(0);
  const [transactionsTotalPages, setTransactionsTotalPages] = useState(1);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [txTypeFilter, setTxTypeFilter] = useState('');
  const [txReasonFilter, setTxReasonFilter] = useState('');
  const [txCompanyFilter, setTxCompanyFilter] = useState('');
  const [transactionsLoading, setTransactionsLoading] = useState(false);

  // Modal state
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    confirmClass?: string;
    requireTyping?: boolean;
    typingTarget?: string;
    onConfirm: () => void;
  } | null>(null);

  // Toast/success message
  const [toast, setToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Grant tokens form state
  const [grantAmount, setGrantAmount] = useState('');
  const [grantReason, setGrantReason] = useState('');
  const [grantLoading, setGrantLoading] = useState(false);

  // Plan change state
  const [planChangeTarget, setPlanChangeTarget] = useState('');

  // AbortController ref for cancellation
  const controllerRef = useRef<AbortController | null>(null);

  // Debounced search values
  const debouncedCompaniesSearch = useDebounce(companiesSearch, 300);
  const debouncedUsersSearch = useDebounce(usersSearch, 300);

  // ─── Toast helper ──────────────────────────────────────────
  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(msg);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 5000);
  }, []);

  // Cleanup toast timeout
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // ─── Auth check ────────────────────────────────────────────
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // ─── Fetch overview ────────────────────────────────────────
  const fetchOverview = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/admin', { signal });
      if (res.status === 403) {
        setAccessDenied(true);
        return;
      }
      const data = await res.json();
      if (data.error) {
        setOverviewError(data.error);
      } else {
        setOverview(data);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setOverviewError('Failed to load overview data');
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (status !== 'authenticated') return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setInitialLoading(true);
    fetchOverview(controller.signal).finally(() => setInitialLoading(false));

    return () => controller.abort();
  }, [status, fetchOverview]);

  // ─── Fetch companies ──────────────────────────────────────
  const fetchCompanies = useCallback(
    async (page: number, search: string, plan: string) => {
      setCompaniesLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page) });
        if (search) params.set('search', search);
        if (plan) params.set('plan', plan);
        const res = await fetch(`/api/admin/companies?${params}`);
        const data = await res.json();
        if (!data.error) {
          setCompanies(data.companies);
          setCompaniesTotal(data.total);
          setCompaniesTotalPages(data.totalPages);
        }
      } catch {
        // silent
      } finally {
        setCompaniesLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (activeTab === 'companies' && !accessDenied) {
      fetchCompanies(companiesPage, debouncedCompaniesSearch, companiesPlanFilter);
    }
  }, [activeTab, companiesPage, debouncedCompaniesSearch, companiesPlanFilter, accessDenied, fetchCompanies]);

  // Reset page on filter change
  useEffect(() => {
    setCompaniesPage(1);
  }, [debouncedCompaniesSearch, companiesPlanFilter]);

  // ─── Fetch company detail ─────────────────────────────────
  const fetchCompanyDetail = useCallback(async (companyId: string) => {
    setCompanyDetailLoading(true);
    setCompanyDetail(null);
    try {
      const res = await fetch(`/api/admin/companies/${companyId}`);
      const data = await res.json();
      if (!data.error) {
        setCompanyDetail(data);
      }
    } catch {
      // silent
    } finally {
      setCompanyDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (expandedCompany) {
      fetchCompanyDetail(expandedCompany);
    }
  }, [expandedCompany, fetchCompanyDetail]);

  // ─── Fetch users ──────────────────────────────────────────
  const fetchUsers = useCallback(
    async (page: number, search: string, role: string) => {
      setUsersLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page) });
        if (search) params.set('search', search);
        if (role) params.set('role', role);
        const res = await fetch(`/api/admin/users?${params}`);
        const data = await res.json();
        if (!data.error) {
          setUsers(data.users);
          setUsersTotal(data.total);
          setUsersTotalPages(data.totalPages);
        }
      } catch {
        // silent
      } finally {
        setUsersLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (activeTab === 'users' && !accessDenied) {
      fetchUsers(usersPage, debouncedUsersSearch, usersRoleFilter);
    }
  }, [activeTab, usersPage, debouncedUsersSearch, usersRoleFilter, accessDenied, fetchUsers]);

  useEffect(() => {
    setUsersPage(1);
  }, [debouncedUsersSearch, usersRoleFilter]);

  // ─── Fetch transactions ───────────────────────────────────
  const fetchTransactions = useCallback(
    async (page: number, type: string, reason: string, companyId: string) => {
      setTransactionsLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page) });
        if (type) params.set('type', type);
        if (reason) params.set('reason', reason);
        if (companyId) params.set('companyId', companyId);
        const res = await fetch(`/api/admin/transactions?${params}`);
        const data = await res.json();
        if (!data.error) {
          setTransactions(data.transactions);
          setTransactionsTotal(data.total);
          setTransactionsTotalPages(data.totalPages);
        }
      } catch {
        // silent
      } finally {
        setTransactionsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (activeTab === 'transactions' && !accessDenied) {
      fetchTransactions(transactionsPage, txTypeFilter, txReasonFilter, txCompanyFilter);
    }
  }, [activeTab, transactionsPage, txTypeFilter, txReasonFilter, txCompanyFilter, accessDenied, fetchTransactions]);

  useEffect(() => {
    setTransactionsPage(1);
  }, [txTypeFilter, txReasonFilter, txCompanyFilter]);

  // ─── Actions ──────────────────────────────────────────────

  const handleGrantTokens = async (companyId: string, companyName: string) => {
    const amount = parseInt(grantAmount, 10);
    if (!amount || amount <= 0) return;

    setConfirmModal({
      title: 'Grant Tokens',
      message: `Grant ${amount.toLocaleString()} tokens to ${companyName}?`,
      confirmLabel: `Grant ${amount.toLocaleString()} tokens`,
      confirmClass: 'bg-green-600 hover:bg-green-500',
      onConfirm: async () => {
        setConfirmModal(null);
        setGrantLoading(true);
        try {
          const res = await fetch(`/api/admin/companies/${companyId}/grant-tokens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, reason: grantReason || undefined }),
          });
          const data = await res.json();
          if (data.success) {
            showToast(`Granted ${amount.toLocaleString()} tokens to ${companyName}`);
            setGrantAmount('');
            setGrantReason('');
            fetchCompanyDetail(companyId);
            fetchCompanies(companiesPage, debouncedCompaniesSearch, companiesPlanFilter);
          } else {
            showToast(`Error: ${data.error}`);
          }
        } catch {
          showToast('Failed to grant tokens');
        } finally {
          setGrantLoading(false);
        }
      },
    });
  };

  const handlePlanChange = async (companyId: string, companyName: string, newPlan: string) => {
    setConfirmModal({
      title: 'Change Plan',
      message: `Change ${companyName} to the ${newPlan} plan?`,
      confirmLabel: `Change to ${newPlan}`,
      confirmClass: 'bg-blue-600 hover:bg-blue-500',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const res = await fetch(`/api/admin/companies/${companyId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan: newPlan }),
          });
          const data = await res.json();
          if (data.success) {
            showToast(`${companyName} plan changed to ${newPlan}`);
            setPlanChangeTarget('');
            fetchCompanyDetail(companyId);
            fetchCompanies(companiesPage, debouncedCompaniesSearch, companiesPlanFilter);
          } else {
            showToast(`Error: ${data.error}`);
          }
        } catch {
          showToast('Failed to change plan');
        }
      },
    });
  };

  const handleSuspend = async (companyId: string, companyName: string, currentlySuspended: boolean) => {
    if (currentlySuspended) {
      // Unsuspend
      setConfirmModal({
        title: 'Unsuspend Company',
        message: `Unsuspend ${companyName}? They will regain access to all features.`,
        confirmLabel: 'Unsuspend',
        confirmClass: 'bg-green-600 hover:bg-green-500',
        onConfirm: async () => {
          setConfirmModal(null);
          try {
            const res = await fetch(`/api/admin/companies/${companyId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ suspended: false }),
            });
            const data = await res.json();
            if (data.success) {
              showToast(`${companyName} has been unsuspended`);
              fetchCompanyDetail(companyId);
              fetchCompanies(companiesPage, debouncedCompaniesSearch, companiesPlanFilter);
            }
          } catch {
            showToast('Failed to unsuspend');
          }
        },
      });
    } else {
      // Suspend — requires typing company name
      setConfirmModal({
        title: 'Suspend Company',
        message: `This will immediately block all API access for ${companyName} and all its users.`,
        confirmLabel: 'Suspend Account',
        confirmClass: 'bg-red-600 hover:bg-red-500',
        requireTyping: true,
        typingTarget: companyName,
        onConfirm: async () => {
          setConfirmModal(null);
          try {
            const res = await fetch(`/api/admin/companies/${companyId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                suspended: true,
                suspendedReason: 'Suspended by platform admin',
              }),
            });
            const data = await res.json();
            if (data.success) {
              showToast(`${companyName} has been suspended`);
              fetchCompanyDetail(companyId);
              fetchCompanies(companiesPage, debouncedCompaniesSearch, companiesPlanFilter);
            }
          } catch {
            showToast('Failed to suspend');
          }
        },
      });
    }
  };

  const handleImpersonate = async (userId: string, userName: string, userEmail: string) => {
    setConfirmModal({
      title: 'Impersonate User',
      message: `Generate a 15-minute session token for ${userName || userEmail}? This will be logged in the audit trail.`,
      confirmLabel: 'Generate Token',
      confirmClass: 'bg-amber-600 hover:bg-amber-500',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const res = await fetch('/api/admin/impersonate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId }),
          });
          const data = await res.json();
          if (data.success) {
            // Copy instructions to clipboard
            try {
              await navigator.clipboard.writeText(data.instructions);
              showToast('Impersonation instructions copied to clipboard');
            } catch {
              showToast('Token generated — check console for instructions');
              console.log('Impersonation instructions:', data.instructions);
            }
          } else {
            showToast(`Error: ${data.error}`);
          }
        } catch {
          showToast('Failed to generate impersonation token');
        }
      },
    });
  };

  // ─── Render guards ────────────────────────────────────────

  if (status === 'loading' || initialLoading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400">Loading admin dashboard...</p>
        </div>
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

  if (overviewError && !overview) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-red-400">{overviewError}</p>
          <button
            onClick={() => fetchOverview()}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  // ─── Main render ──────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gray-950">
      {/* Toast notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-800 border border-gray-600 text-white text-sm px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 animate-slide-in">
          <span>{toast}</span>
          <button onClick={() => setToast(null)} className="text-gray-400 hover:text-white">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Confirmation modal */}
      {confirmModal && (
        <ConfirmModal
          {...confirmModal}
          onCancel={() => setConfirmModal(null)}
        />
      )}

      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-white text-sm">&larr; Back</Link>
            <h1 className="text-xl font-bold text-white">Platform Admin</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/50 text-red-400 font-medium border border-red-800/50">
              Super Admin
            </span>
          </div>
          <UserMenu />
        </div>
      </header>

      {/* Tab navigation */}
      <div className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1 py-2 overflow-x-auto">
            <TabButton label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
            <TabButton
              label="Companies"
              active={activeTab === 'companies'}
              onClick={() => setActiveTab('companies')}
              count={overview?.totalCompanies}
            />
            <TabButton
              label="Users"
              active={activeTab === 'users'}
              onClick={() => setActiveTab('users')}
              count={overview?.totalUsers}
            />
            <TabButton label="Transactions" active={activeTab === 'transactions'} onClick={() => setActiveTab('transactions')} />
            <TabButton label="Support" active={activeTab === 'support'} onClick={() => setActiveTab('support')} />
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* ═══ OVERVIEW TAB ═══ */}
        {activeTab === 'overview' && overview && (
          <div className="space-y-8">
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Total Companies" value={overview.totalCompanies} />
              <StatCard label="Total Users" value={overview.totalUsers} />
              <StatCard label="Monthly Revenue" value={formatPence(overview.monthlyRevenuePence)} sub="Token top-ups" />
              <StatCard label="All-Time Revenue" value={formatPence(overview.allTimeRevenuePence)} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Active Subscriptions" value={overview.activeSubscriptions} />
              <StatCard label="Monthly API Cost" value={formatPence(overview.monthlySpendPence)} sub="Internal cost" />
              <StatCard label="All-Time API Cost" value={formatPence(overview.allTimeSpendPence)} sub="Internal cost" />
              <StatCard
                label="MRR Estimate"
                value={formatPence(overview.monthlyRevenuePence)}
                sub="Based on completed top-ups"
              />
            </div>

            {/* Plan distribution */}
            <div>
              <h2 className="text-lg font-semibold text-white mb-3">Plan Distribution</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {['FREE', 'STARTER', 'PRO', 'ENTERPRISE'].map((plan) => (
                  <div key={plan} className="bg-gray-800 rounded-xl border border-gray-700 p-4 text-center">
                    <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium border ${planBadgeClass(plan)}`}>
                      {plan}
                    </span>
                    <p className="text-2xl font-bold text-white mt-2">
                      {overview.planDistribution[plan] || 0}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">companies</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Charts placeholder */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-8 text-center">
              <svg className="w-12 h-12 mx-auto text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
              <p className="text-gray-400 text-sm">Revenue and usage charts coming soon</p>
              <p className="text-gray-500 text-xs mt-1">This area will display trend graphs for revenue, signups, and API usage over time</p>
            </div>

            {/* Recent activity */}
            <div>
              <h2 className="text-lg font-semibold text-white mb-3">Recent API Activity</h2>
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
                    {overview.recentActivity.map((a) => (
                      <tr key={a.id} className="border-b border-gray-700/50 hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{formatDateTime(a.createdAt)}</td>
                        <td className="px-4 py-3 text-white">{a.companyName}</td>
                        <td className="px-4 py-3 text-gray-300">{a.userName}</td>
                        <td className="px-4 py-3 text-white">
                          {a.service === 'ANTHROPIC' ? 'Claude' : a.service === 'GOOGLE_VEO' ? 'Veo' : a.service}
                        </td>
                        <td className="px-4 py-3 text-white text-right font-medium">{formatPence(a.costCents)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block w-2 h-2 rounded-full ${a.success ? 'bg-green-500' : 'bg-red-500'}`} />
                        </td>
                      </tr>
                    ))}
                    {overview.recentActivity.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No recent API activity</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ═══ COMPANIES TAB ═══ */}
        {activeTab === 'companies' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <SearchInput
                  value={companiesSearch}
                  onChange={setCompaniesSearch}
                  placeholder="Search companies by name..."
                />
              </div>
              <select
                value={companiesPlanFilter}
                onChange={(e) => setCompaniesPlanFilter(e.target.value)}
                className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">All Plans</option>
                <option value="FREE">Free</option>
                <option value="STARTER">Starter</option>
                <option value="PRO">Pro</option>
                <option value="ENTERPRISE">Enterprise</option>
              </select>
            </div>

            {/* Results info */}
            <p className="text-xs text-gray-400">
              {companiesTotal} {companiesTotal === 1 ? 'company' : 'companies'} found
            </p>

            {/* Table */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
              {companiesLoading ? (
                <div className="px-4 py-12 text-center">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">Loading companies...</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Company</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Plan</th>
                      <th className="text-right px-4 py-3 text-gray-400 font-medium">Users</th>
                      <th className="text-right px-4 py-3 text-gray-400 font-medium">Token Balance</th>
                      <th className="text-right px-4 py-3 text-gray-400 font-medium">Monthly Used</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Created</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Stripe</th>
                      <th className="text-center px-4 py-3 text-gray-400 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companies.map((c) => (
                      <React.Fragment key={c.id}>
                        <tr
                          className={`border-b border-gray-700/50 cursor-pointer transition-colors ${
                            expandedCompany === c.id ? 'bg-gray-750' : 'hover:bg-gray-800/50'
                          }`}
                          onClick={() => setExpandedCompany(expandedCompany === c.id ? null : c.id)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <svg
                                className={`w-4 h-4 text-gray-400 transition-transform ${expandedCompany === c.id ? 'rotate-90' : ''}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                              <span className="text-white font-medium">{c.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${planBadgeClass(c.plan)}`}>
                              {c.plan}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-300 text-right">{c.userCount}</td>
                          <td className="px-4 py-3 text-white text-right font-medium">{c.tokenBalance.toLocaleString()}</td>
                          <td className="px-4 py-3 text-gray-300 text-right">{c.monthlyTokensUsed.toLocaleString()}</td>
                          <td className="px-4 py-3 text-gray-300">{formatDate(c.createdAt)}</td>
                          <td className="px-4 py-3">
                            {(() => {
                              const badge = stripeBadge(c.stripeStatus);
                              return (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
                                  {badge.text}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {c.suspended ? (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/50 text-red-400 font-medium">
                                Suspended
                              </span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/50 text-green-400 font-medium">
                                Active
                              </span>
                            )}
                          </td>
                        </tr>

                        {/* Expanded company detail */}
                        {expandedCompany === c.id && (
                          <tr>
                            <td colSpan={8} className="px-0 py-0">
                              <CompanyDetailPanel
                                companyId={c.id}
                                detail={companyDetail}
                                loading={companyDetailLoading}
                                grantAmount={grantAmount}
                                grantReason={grantReason}
                                grantLoading={grantLoading}
                                planChangeTarget={planChangeTarget}
                                onGrantAmountChange={setGrantAmount}
                                onGrantReasonChange={setGrantReason}
                                onPlanChangeTargetChange={setPlanChangeTarget}
                                onGrantTokens={() => handleGrantTokens(c.id, c.name)}
                                onPlanChange={(plan) => handlePlanChange(c.id, c.name, plan)}
                                onSuspend={() => handleSuspend(c.id, c.name, c.suspended)}
                                onImpersonate={(userId, name, email) => handleImpersonate(userId, name, email)}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                    {companies.length === 0 && !companiesLoading && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-500">No companies found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            <Pagination page={companiesPage} totalPages={companiesTotalPages} onPageChange={setCompaniesPage} />
          </div>
        )}

        {/* ═══ USERS TAB ═══ */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <SearchInput
                  value={usersSearch}
                  onChange={setUsersSearch}
                  placeholder="Search users by name or email..."
                />
              </div>
              <select
                value={usersRoleFilter}
                onChange={(e) => setUsersRoleFilter(e.target.value)}
                className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">All Roles</option>
                <option value="OWNER">Owner</option>
                <option value="ADMIN">Admin</option>
                <option value="MEMBER">Member</option>
              </select>
            </div>

            <p className="text-xs text-gray-400">
              {usersTotal} {usersTotal === 1 ? 'user' : 'users'} found
            </p>

            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
              {usersLoading ? (
                <div className="px-4 py-12 text-center">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">Loading users...</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Name</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Email</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Company</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Role</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Last Login</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Created</th>
                      <th className="text-center px-4 py-3 text-gray-400 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-gray-700/50 hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-white font-medium">
                          <div className="flex items-center gap-2">
                            {u.name || '-'}
                            {u.companySuspended && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/50 text-red-400">suspended</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-300">{u.email}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-white">{u.companyName}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${planBadgeClass(u.companyPlan)}`}>
                              {u.companyPlan}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleBadgeClass(u.role)}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-300">
                          {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}
                        </td>
                        <td className="px-4 py-3 text-gray-300">{formatDate(u.createdAt)}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleImpersonate(u.id, u.name || '', u.email)}
                            className="text-xs px-2.5 py-1 bg-amber-900/30 hover:bg-amber-900/50 text-amber-400 rounded-lg transition-colors"
                            title="Impersonate user"
                          >
                            Impersonate
                          </button>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && !usersLoading && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No users found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            <Pagination page={usersPage} totalPages={usersTotalPages} onPageChange={setUsersPage} />
          </div>
        )}

        {/* ═══ TRANSACTIONS TAB ═══ */}
        {activeTab === 'transactions' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={txTypeFilter}
                onChange={(e) => setTxTypeFilter(e.target.value)}
                className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">All Types</option>
                <option value="CREDIT">Credit</option>
                <option value="DEBIT">Debit</option>
              </select>
              <select
                value={txReasonFilter}
                onChange={(e) => setTxReasonFilter(e.target.value)}
                className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">All Reasons</option>
                <option value="PLAN_ALLOCATION">Plan Allocation</option>
                <option value="TOPUP_PURCHASE">Top-up Purchase</option>
                <option value="ADMIN_GRANT">Admin Grant</option>
                <option value="RENDER">Render</option>
                <option value="GENERATE_VIDEO">Video Generation</option>
                <option value="REFUND">Refund</option>
                <option value="EXPIRY">Expiry</option>
                <option value="ADJUSTMENT">Adjustment</option>
              </select>
              <input
                type="text"
                value={txCompanyFilter}
                onChange={(e) => setTxCompanyFilter(e.target.value)}
                placeholder="Filter by company ID..."
                className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <p className="text-xs text-gray-400">
              {transactionsTotal} {transactionsTotal === 1 ? 'transaction' : 'transactions'} found
            </p>

            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
              {transactionsLoading ? (
                <div className="px-4 py-12 text-center">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">Loading transactions...</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Time</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Company</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">User</th>
                      <th className="text-center px-4 py-3 text-gray-400 font-medium">Type</th>
                      <th className="text-right px-4 py-3 text-gray-400 font-medium">Amount</th>
                      <th className="text-right px-4 py-3 text-gray-400 font-medium">Balance After</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Reason</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => (
                      <tr key={t.id} className="border-b border-gray-700/50 hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{formatDateTime(t.createdAt)}</td>
                        <td className="px-4 py-3 text-white">{t.companyName}</td>
                        <td className="px-4 py-3 text-gray-300">{t.userName}</td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              t.type === 'CREDIT'
                                ? 'bg-green-900/50 text-green-400'
                                : 'bg-red-900/50 text-red-400'
                            }`}
                          >
                            {t.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          <span className={t.type === 'CREDIT' ? 'text-green-400' : 'text-red-400'}>
                            {t.type === 'CREDIT' ? '+' : '-'}{t.amount.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-300 text-right">{t.balanceAfter.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300 font-mono">
                            {t.reason}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs max-w-[200px] truncate">
                          {t.description || '-'}
                        </td>
                      </tr>
                    ))}
                    {transactions.length === 0 && !transactionsLoading && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-500">No transactions found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            <Pagination page={transactionsPage} totalPages={transactionsTotalPages} onPageChange={setTransactionsPage} />
          </div>
        )}

        {/* ═══ SUPPORT TAB ═══ */}
        {activeTab === 'support' && (
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-12 text-center">
            <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.712 4.33a9.027 9.027 0 011.652 1.306c.51.51.944 1.064 1.306 1.652M16.712 4.33l-3.448 4.138m3.448-4.138a9.014 9.014 0 00-9.424 0M19.67 7.288l-4.138 3.448m4.138-3.448a9.014 9.014 0 010 9.424m-4.138-5.976a3.736 3.736 0 00-.88-1.388 3.737 3.737 0 00-1.388-.88m2.268 2.268a3.765 3.765 0 010 2.528m-2.268-4.796a3.765 3.765 0 00-2.528 0m4.796 4.796c-.181.506-.475.982-.88 1.388a3.736 3.736 0 01-1.388.88m2.268-2.268l4.138 3.448m0 0a9.027 9.027 0 01-1.306 1.652c-.51.51-1.064.944-1.652 1.306m0 0l-3.448-4.138m3.448 4.138a9.014 9.014 0 01-9.424 0m5.976-4.138a3.765 3.765 0 01-2.528 0m0 0a3.736 3.736 0 01-1.388-.88 3.737 3.737 0 01-.88-1.388m0 0l-4.138 3.448M4.33 16.712a9.014 9.014 0 010-9.424m4.138 5.976l-4.138 3.448m0-9.424l4.138 3.448m-4.138-3.448A9.027 9.027 0 015.636 5.636c.51-.51 1.064-.944 1.652-1.306m0 0l3.448 4.138m-3.448-4.138a9.014 9.014 0 019.424 0M7.288 4.33l3.448 4.138" />
            </svg>
            <h2 className="text-xl font-bold text-white mb-2">Support Ticket Management</h2>
            <p className="text-gray-400 mb-1">This section is under development.</p>
            <p className="text-gray-500 text-sm">Customer support ticket management will be built by another agent and integrated here.</p>
          </div>
        )}
      </div>
    </main>
  );
}

// ─── Stat Card Component ────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-3xl font-bold text-white mt-1">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Company Detail Panel ───────────────────────────────────

function CompanyDetailPanel({
  companyId,
  detail,
  loading,
  grantAmount,
  grantReason,
  grantLoading,
  planChangeTarget,
  onGrantAmountChange,
  onGrantReasonChange,
  onPlanChangeTargetChange,
  onGrantTokens,
  onPlanChange,
  onSuspend,
  onImpersonate,
}: {
  companyId: string;
  detail: CompanyDetail | null;
  loading: boolean;
  grantAmount: string;
  grantReason: string;
  grantLoading: boolean;
  planChangeTarget: string;
  onGrantAmountChange: (v: string) => void;
  onGrantReasonChange: (v: string) => void;
  onPlanChangeTargetChange: (v: string) => void;
  onGrantTokens: () => void;
  onPlanChange: (plan: string) => void;
  onSuspend: () => void;
  onImpersonate: (userId: string, name: string, email: string) => void;
}) {
  if (loading) {
    return (
      <div className="bg-gray-900 border-t border-gray-700 px-6 py-8 text-center">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-gray-400 text-sm">Loading company details...</p>
      </div>
    );
  }

  if (!detail) return null;

  return (
    <div className="bg-gray-900 border-t border-gray-700 px-6 py-6 space-y-6">
      {/* Header info */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-xs text-gray-400 mb-1">Token Balance</p>
          <p className="text-2xl font-bold text-white">{detail.tokenBalance.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">Monthly used: {detail.monthlyTokensUsed.toLocaleString()}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-xs text-gray-400 mb-1">Total Revenue</p>
          <p className="text-2xl font-bold text-white">{formatPence(detail.totalRevenuePence)}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-xs text-gray-400 mb-1">Projects</p>
          <p className="text-2xl font-bold text-white">{detail._count.projects}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-xs text-gray-400 mb-1">API Calls</p>
          <p className="text-2xl font-bold text-white">{detail._count.apiUsage.toLocaleString()}</p>
        </div>
      </div>

      {/* Actions row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Grant tokens */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-1">
            Grant Tokens
            <Tooltip text="Add tokens to this company's balance. Creates a CREDIT transaction with ADMIN_GRANT reason." />
          </h4>
          <div className="space-y-2">
            <input
              type="number"
              value={grantAmount}
              onChange={(e) => onGrantAmountChange(e.target.value)}
              placeholder="Amount (e.g. 100)"
              min="1"
              max="100000"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
            />
            <input
              type="text"
              value={grantReason}
              onChange={(e) => onGrantReasonChange(e.target.value)}
              placeholder="Reason (optional)"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
            />
            <button
              onClick={onGrantTokens}
              disabled={!grantAmount || parseInt(grantAmount, 10) <= 0 || grantLoading}
              className="w-full px-3 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {grantLoading ? 'Granting...' : 'Grant Tokens'}
            </button>
          </div>
        </div>

        {/* Change plan */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-1">
            Change Plan
            <Tooltip text="Override this company's plan tier. Note: This does NOT affect their Stripe subscription." />
          </h4>
          <p className="text-xs text-gray-400 mb-2">
            Current: <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${planBadgeClass(detail.plan)}`}>{detail.plan}</span>
          </p>
          <div className="space-y-2">
            <select
              value={planChangeTarget}
              onChange={(e) => onPlanChangeTargetChange(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">Select new plan...</option>
              {['FREE', 'STARTER', 'PRO', 'ENTERPRISE'].filter((p) => p !== detail.plan).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <button
              onClick={() => planChangeTarget && onPlanChange(planChangeTarget)}
              disabled={!planChangeTarget}
              className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Change Plan
            </button>
          </div>
        </div>

        {/* Suspend/Unsuspend */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-1">
            Account Status
            <Tooltip text="Suspended accounts cannot access any API endpoints. All users in the company are blocked." />
          </h4>
          {detail.suspended ? (
            <div className="space-y-2">
              <div className="px-3 py-2 bg-red-900/20 border border-red-800/50 rounded-lg">
                <p className="text-xs text-red-400 font-medium">Suspended</p>
                <p className="text-xs text-gray-400 mt-1">
                  {detail.suspendedReason || 'No reason specified'}
                </p>
                {detail.suspendedAt && (
                  <p className="text-xs text-gray-500 mt-1">
                    Since {formatDateTime(detail.suspendedAt)}
                  </p>
                )}
              </div>
              <button
                onClick={onSuspend}
                className="w-full px-3 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Unsuspend Account
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="px-3 py-2 bg-green-900/20 border border-green-800/50 rounded-lg">
                <p className="text-xs text-green-400 font-medium">Active</p>
                <p className="text-xs text-gray-400 mt-1">Company has full access</p>
              </div>
              <button
                onClick={onSuspend}
                className="w-full px-3 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Suspend Account
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Users table */}
      <div>
        <h4 className="text-sm font-semibold text-white mb-2">Company Users ({detail.users.length})</h4>
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left px-3 py-2 text-gray-400 font-medium">Name</th>
                <th className="text-left px-3 py-2 text-gray-400 font-medium">Email</th>
                <th className="text-left px-3 py-2 text-gray-400 font-medium">Role</th>
                <th className="text-left px-3 py-2 text-gray-400 font-medium">Last Login</th>
                <th className="text-center px-3 py-2 text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {detail.users.map((u) => (
                <tr key={u.id} className="border-b border-gray-700/50">
                  <td className="px-3 py-2 text-white">{u.name || '-'}</td>
                  <td className="px-3 py-2 text-gray-300">{u.email}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleBadgeClass(u.role)}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-400">
                    {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => onImpersonate(u.id, u.name || '', u.email)}
                      className="text-[10px] px-2 py-0.5 bg-amber-900/30 hover:bg-amber-900/50 text-amber-400 rounded transition-colors"
                    >
                      Impersonate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent transactions */}
      {detail.recentTransactions.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Recent Transactions</h4>
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left px-3 py-2 text-gray-400 font-medium">Time</th>
                  <th className="text-center px-3 py-2 text-gray-400 font-medium">Type</th>
                  <th className="text-right px-3 py-2 text-gray-400 font-medium">Amount</th>
                  <th className="text-right px-3 py-2 text-gray-400 font-medium">Balance</th>
                  <th className="text-left px-3 py-2 text-gray-400 font-medium">Reason</th>
                  <th className="text-left px-3 py-2 text-gray-400 font-medium">User</th>
                </tr>
              </thead>
              <tbody>
                {detail.recentTransactions.map((t) => (
                  <tr key={t.id} className="border-b border-gray-700/50">
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{formatDateTime(t.createdAt)}</td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          t.type === 'CREDIT' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                        }`}
                      >
                        {t.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      <span className={t.type === 'CREDIT' ? 'text-green-400' : 'text-red-400'}>
                        {t.type === 'CREDIT' ? '+' : '-'}{t.amount.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-300 text-right">{t.balanceAfter.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 font-mono">
                        {t.reason}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-400">{t.userName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
