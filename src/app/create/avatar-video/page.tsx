'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';

export default function AvatarVideoPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 px-3 sm:px-6 py-3 sm:py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <Link href="/" className="text-lg sm:text-xl font-bold text-white shrink-0 hover:text-blue-400 transition-colors">Ad Maker</Link>
          <UserMenu />
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="w-16 h-16 mx-auto mb-6 bg-blue-600/20 rounded-2xl flex items-center justify-center">
          <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">Avatar Video Creator</h1>
        <p className="text-gray-400 mb-8 max-w-lg mx-auto">
          Create AI avatar videos with lip-sync. Generate an avatar image, add your script and voiceover, and produce talking-head video ads.
        </p>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-left space-y-3">
          <p className="text-sm text-gray-300 font-medium">Coming in the next update:</p>
          <ul className="text-sm text-gray-500 space-y-2">
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-blue-500 rounded-full" /> Generate avatar images with AI (Nano Banana 2)</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-blue-500 rounded-full" /> Save avatars to your Avatar Library</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-blue-500 rounded-full" /> Upload product photos with multi-angle generation</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-blue-500 rounded-full" /> Paste script + select ElevenLabs voice</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-blue-500 rounded-full" /> Lip-sync video generation (Creatify Aurora)</li>
          </ul>
        </div>
        <Link href="/" className="inline-block mt-8 px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors">
          Back to Home
        </Link>
      </div>
    </main>
  );
}
