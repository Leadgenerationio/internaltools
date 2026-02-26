'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';

interface CompanyUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Company settings — monthly token budget
  const [tokenBudget, setTokenBudget] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetMessage, setBudgetMessage] = useState('');

  // Logo
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoMessage, setLogoMessage] = useState('');

  // Invite form
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/company/users');
      const data = await res.json();
      if (data.error) setError(data.error);
      else setUsers(data.users);
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

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

    loadUsers();

    // Load company settings
    fetch('/api/company/settings')
      .then((r) => r.json())
      .then((d) => {
        if (d.company?.monthlyTokenBudget) {
          setTokenBudget(String(d.company.monthlyTokenBudget));
        }
      })
      .catch(() => {});
  }, [status, session, router, loadUsers]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    setInviting(true);

    try {
      const res = await fetch('/api/company/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          name: inviteName,
          password: invitePassword,
          userRole: inviteRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.error || 'Failed to create user');
        return;
      }

      setInviteSuccess(`User ${inviteEmail} created successfully`);
      setInviteEmail('');
      setInviteName('');
      setInvitePassword('');
      setShowInvite(false);
      loadUsers();
    } catch {
      setInviteError('Something went wrong');
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveUser = async (userId: string, email: string) => {
    if (!confirm(`Remove ${email} from the team?`)) return;

    try {
      const res = await fetch('/api/company/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (res.ok) {
        loadUsers();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to remove user');
      }
    } catch {
      alert('Something went wrong');
    }
  };

  if (status === 'loading' || loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </main>
    );
  }

  const isOwner = session?.user?.role === 'OWNER';

  return (
    <main className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 px-4 sm:px-6 py-3 sm:py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <Link href="/" className="text-gray-400 hover:text-white text-sm">&larr; Back</Link>
            <h1 className="text-lg sm:text-xl font-bold text-white">Settings & Users</h1>
          </div>
          <UserMenu />
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Company Info */}
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-2">{session?.user?.companyName}</h2>
          <p className="text-sm text-gray-400">{users.length} team member{users.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Monthly Token Budget */}
        {isOwner && (
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h2 className="text-lg font-semibold text-white mb-3">Monthly Token Budget</h2>
            <p className="text-sm text-gray-400 mb-3">
              Set a monthly token usage cap. Operations will be blocked once the budget is reached. Leave empty for no limit.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSavingBudget(true);
                setBudgetMessage('');
                try {
                  const budget = tokenBudget ? Math.round(Number(tokenBudget)) : null;
                  const res = await fetch('/api/company/settings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ monthlyTokenBudget: budget }),
                  });
                  const data = await res.json();
                  if (!res.ok) setBudgetMessage(data.error || 'Failed to save');
                  else setBudgetMessage('Budget saved');
                } catch {
                  setBudgetMessage('Failed to save');
                } finally {
                  setSavingBudget(false);
                  setTimeout(() => setBudgetMessage(''), 5000);
                }
              }}
              className="flex items-center gap-3"
            >
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={tokenBudget}
                  onChange={(e) => setTokenBudget(e.target.value)}
                  placeholder="No limit"
                  className="w-40 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">tokens</span>
              </div>
              <button
                type="submit"
                disabled={savingBudget}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg font-medium transition-colors"
              >
                {savingBudget ? 'Saving...' : 'Save'}
              </button>
              {budgetMessage && (
                <span className={`text-sm ${budgetMessage.includes('Failed') ? 'text-red-400' : 'text-green-400'}`}>
                  {budgetMessage}
                </span>
              )}
            </form>
          </div>
        )}

        {/* Company Logo */}
        {isOwner && (
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h2 className="text-lg font-semibold text-white mb-3">Company Logo</h2>
            <p className="text-sm text-gray-400 mb-3">
              Upload your company logo (PNG, JPEG, SVG, or WebP, max 2MB).
            </p>
            <div className="flex items-center gap-4">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt="Company logo"
                  className="w-12 h-12 rounded-lg object-contain bg-gray-900 border border-gray-700"
                />
              )}
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploadingLogo(true);
                    setLogoMessage('');
                    try {
                      const formData = new FormData();
                      formData.append('logo', file);
                      const res = await fetch('/api/company/logo', {
                        method: 'POST',
                        body: formData,
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        setLogoMessage(data.error || 'Upload failed');
                      } else {
                        setLogoUrl(data.logoUrl);
                        setLogoMessage('Logo uploaded');
                      }
                    } catch {
                      setLogoMessage('Upload failed');
                    } finally {
                      setUploadingLogo(false);
                      setTimeout(() => setLogoMessage(''), 5000);
                    }
                  }}
                />
                <span className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg font-medium transition-colors inline-block">
                  {uploadingLogo ? 'Uploading...' : 'Choose File'}
                </span>
              </label>
              {logoMessage && (
                <span className={`text-sm ${logoMessage.includes('failed') ? 'text-red-400' : 'text-green-400'}`}>
                  {logoMessage}
                </span>
              )}
            </div>
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {/* Team Members */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Team Members</h2>
            <button
              onClick={() => setShowInvite(!showInvite)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg font-medium transition-colors"
            >
              Add User
            </button>
          </div>

          {/* Invite Form */}
          {showInvite && (
            <form onSubmit={handleInvite} className="bg-gray-800 rounded-xl p-5 border border-gray-700 mb-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Email"
                  required
                  className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Name (optional)"
                  className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  placeholder="Temporary password (min 8 chars)"
                  required
                  minLength={8}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
                {isOwner && (
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Admin</option>
                    <option value="OWNER">Owner</option>
                  </select>
                )}
              </div>
              {inviteError && <p className="text-red-400 text-sm">{inviteError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={inviting}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg font-medium disabled:opacity-50"
                >
                  {inviting ? 'Creating...' : 'Create User'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {inviteSuccess && (
            <p className="text-green-400 text-sm mb-4">{inviteSuccess}</p>
          )}

          {/* Users Table */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">User</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Role</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Last Login</th>
                  {isOwner && <th className="text-right px-4 py-3 text-gray-400 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-700/50">
                    <td className="px-4 py-3">
                      <p className="text-white font-medium">{u.name || 'No name'}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        u.role === 'OWNER' ? 'bg-yellow-900/50 text-yellow-400' :
                        u.role === 'ADMIN' ? 'bg-blue-900/50 text-blue-400' :
                        'bg-gray-700 text-gray-300'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}
                    </td>
                    {isOwner && (
                      <td className="px-4 py-3 text-right">
                        {u.id !== session?.user?.id && (
                          <button
                            onClick={() => handleRemoveUser(u.id, u.email)}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
