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
    href: '/projects',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    ),
    available: true,
  },
  {
    id: 'longform-video',
    name: 'Longform Video',
    description: 'Generate full video ads from a brief — AI scripts, voiceover, b-roll clips, and animated captions. No footage needed.',
    href: '/create/longform-video',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-2.625 0V5.625m0 12.75v-12.75A1.125 1.125 0 0 1 4.5 4.5h15a1.125 1.125 0 0 1 1.125 1.125v12.75m-18 0h18m0 0a1.125 1.125 0 0 1-1.125 1.125m1.125-1.125v-12.75A1.125 1.125 0 0 0 19.5 4.5h-15a1.125 1.125 0 0 0-1.125 1.125m17.25 12.75h-1.5c-.621 0-1.125-.504-1.125-1.125" />
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
  {
    id: 'ugc-style',
    name: 'UGC-Style Video',
    description: 'Generate authentic user-generated content style video ads with AI avatars, product showcases, and testimonial formats.',
    href: '#',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
      </svg>
    ),
    available: false,
    tag: 'Coming Soon',
  },
  {
    id: 'carousel',
    name: 'Carousel Ad',
    description: 'Design multi-slide carousel ads for Instagram and Facebook with cohesive storytelling across each card.',
    href: '#',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 0 1 2.25-2.25h7.5A2.25 2.25 0 0 1 18 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 0 0 4.5 9v.878m13.5-3A2.25 2.25 0 0 1 19.5 9v.878m0 0a2.246 2.246 0 0 0-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0 1 21 12v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6a2.25 2.25 0 0 1 1.5-2.122" />
      </svg>
    ),
    available: false,
    tag: 'Coming Soon',
  },
  {
    id: 'story-ad',
    name: 'Story / Reel Ad',
    description: 'Build vertical 9:16 story and reel ads optimised for Instagram Stories, TikTok, and YouTube Shorts.',
    href: '#',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
      </svg>
    ),
    available: false,
    tag: 'Coming Soon',
  },
  {
    id: 'ai-video-gen',
    name: 'AI Video from Script',
    description: 'Turn a text script into a fully produced video ad using AI video generation. No footage needed.',
    href: '#',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
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
