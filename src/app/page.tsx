'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';

interface AdModel {
  id: string;
  name: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  available: boolean;
  tag?: string;
}

const AD_MODELS: AdModel[] = [
  {
    id: 'video-overlay',
    name: 'Video Text Overlay',
    description: 'Generate AI ad copy and overlay text on your videos with timed animations. Perfect for social media ads with eye-catching text.',
    href: '/create/video-overlay',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    ),
    available: true,
  },
  {
    id: 'longform-from-video',
    name: 'Longform From Video Made Already',
    description: 'Upload your video with audio, add b-roll, captions & music. Original audio is preserved — perfect for enhancing talking-head content.',
    href: '/create/longform-from-video',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
      </svg>
    ),
    available: true,
    tag: 'New',
  },
  {
    id: 'avatar-video',
    name: 'Avatar Video Creator',
    description: 'Create AI avatar videos with lip-sync. Generate an avatar, add your script and voiceover, and produce talking-head video ads.',
    href: '/create/avatar-video',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
      </svg>
    ),
    available: true,
    tag: 'New',
  },
  {
    id: 'video-cutup',
    name: 'Video Cut Up',
    description: 'Upload a video, auto-detect scenes, and save the clips you want to your media library. Free — no tokens needed.',
    href: '/create/video-cutup',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m7.848 8.25 1.536.887M7.848 8.25a3 3 0 1 1-5.196-3 3 3 0 0 1 5.196 3Zm1.536.887a2.165 2.165 0 0 1 1.083 1.839c.005.351.054.695.14 1.024M9.384 9.137l2.077 1.199M7.848 15.75l1.536-.887m-1.536.887a3 3 0 1 1-5.196 3 3 3 0 0 1 5.196-3Zm1.536-.887a2.165 2.165 0 0 0 1.083-1.838c.005-.352.054-.696.14-1.025m-1.223 2.863 2.077-1.199m0-3.328a4.323 4.323 0 0 1 2.068-1.379l5.325-1.628a4.5 4.5 0 0 1 2.48-.044l.803.215-7.794 4.5m-2.882-1.664A4.33 4.33 0 0 0 10.607 12m3.736 0 7.794 4.5-.802.215a4.5 4.5 0 0 1-2.48-.043l-5.326-1.629a4.324 4.324 0 0 1-2.068-1.379M14.343 12l-2.882 1.664" />
      </svg>
    ),
    available: true,
    tag: 'New',
  },
  {
    id: 'image-ad',
    name: 'Static Image Ad',
    description: 'Create scroll-stopping static image ads with AI-generated copy, layouts, and branded visuals for social platforms.',
    href: '#',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
      </svg>
    ),
    available: false,
    tag: 'Coming Soon',
  },
];

export default function HomePage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/welcome');
    }
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
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Ad Maker</h1>
          <UserMenu />
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">Create an Ad</h2>
          <p className="text-gray-400">Choose a format to get started</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {AD_MODELS.map((model) => {
            const content = (
              <>
                {model.tag && (
                  <span className={`absolute top-4 right-4 px-2.5 py-0.5 text-xs font-medium rounded-full border ${
                    model.tag === 'New'
                      ? 'bg-green-500/10 text-green-400 border-green-500/30'
                      : 'bg-gray-800 text-gray-400 border-gray-700'
                  }`}>
                    {model.tag}
                  </span>
                )}
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${
                  model.available
                    ? 'bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20'
                    : 'bg-gray-800 text-gray-500'
                }`}>
                  {model.icon}
                </div>
                <h3 className={`text-lg font-semibold mb-2 ${
                  model.available ? 'text-white' : 'text-gray-400'
                }`}>
                  {model.name}
                </h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  {model.description}
                </p>
                {model.available && (
                  <div className="mt-4 flex items-center text-sm text-blue-400 font-medium group-hover:text-blue-300">
                    Get started
                    <svg className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                  </div>
                )}
              </>
            );

            const className = `group relative bg-gray-900 border rounded-xl p-6 transition-all ${
              model.available
                ? 'border-gray-700 hover:border-blue-500 hover:bg-gray-800 cursor-pointer'
                : 'border-gray-800 opacity-60 cursor-default'
            }`;

            return model.available ? (
              <Link key={model.id} href={model.href} className={className}>
                {content}
              </Link>
            ) : (
              <div key={model.id} className={className}>
                {content}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
