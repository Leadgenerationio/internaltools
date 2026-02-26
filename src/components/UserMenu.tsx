'use client';

import { useState, useRef, useEffect } from 'react';
import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';

export default function UserMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!session?.user) return null;

  const initials = (session.user.name || session.user.email || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const isAdmin = session.user.role === 'OWNER' || session.user.role === 'ADMIN';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
          {initials}
        </div>
        <div className="hidden sm:block text-left">
          <p className="text-xs text-white font-medium leading-tight">
            {session.user.name || session.user.email}
          </p>
          <p className="text-[10px] text-gray-400 leading-tight">
            {session.user.companyName}
          </p>
        </div>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700">
            <p className="text-sm text-white font-medium">{session.user.name || 'User'}</p>
            <p className="text-xs text-gray-400">{session.user.email}</p>
            <p className="text-xs text-gray-500 mt-0.5">{session.user.companyName} &middot; {session.user.role}</p>
          </div>

          <div className="py-1">
            {isAdmin && (
              <>
                <Link
                  href="/usage"
                  onClick={() => setOpen(false)}
                  className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                >
                  Usage & Costs
                </Link>
                <Link
                  href="/settings"
                  onClick={() => setOpen(false)}
                  className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                >
                  Settings & Users
                </Link>
              </>
            )}
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
