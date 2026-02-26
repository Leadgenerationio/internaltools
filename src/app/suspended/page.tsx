'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';

export default function SuspendedPage() {
  const { data: session } = useSession();

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 mx-auto rounded-full bg-red-900/30 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-white">Account Suspended</h1>
          <p className="text-gray-400 mt-2">
            Your company account has been suspended. All features are temporarily unavailable.
          </p>
        </div>

        {session?.user?.companyName && (
          <div className="bg-gray-800 rounded-xl border border-gray-700 px-4 py-3">
            <p className="text-sm text-gray-400">Company</p>
            <p className="text-white font-medium">{session.user.companyName}</p>
          </div>
        )}

        <div className="bg-gray-800/50 rounded-xl border border-gray-700 px-5 py-4 text-left">
          <p className="text-sm text-gray-300 leading-relaxed">
            If you believe this is an error, please contact our support team at{' '}
            <a
              href="mailto:support@admaker.io"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              support@admaker.io
            </a>{' '}
            with your company name and we will review your account.
          </p>
        </div>

        <div className="flex gap-3 justify-center">
          <Link
            href="/help"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors border border-gray-700"
          >
            Help Center
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="px-4 py-2 bg-red-900/50 hover:bg-red-900/70 text-red-300 text-sm rounded-lg transition-colors border border-red-800/50"
          >
            Sign Out
          </button>
        </div>
      </div>
    </main>
  );
}
