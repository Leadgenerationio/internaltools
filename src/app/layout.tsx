import type { Metadata, Viewport } from 'next';
import Providers from '@/components/Providers';
import './globals.css';

const BASE_URL = process.env.NEXTAUTH_URL || 'https://admaker.io';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'Ad Maker — Create Scroll-Stopping Video Ads',
    template: 'Ad Maker — %s',
  },
  description:
    'AI-powered ad copy generation, video rendering with timed overlays, and team collaboration. Create scroll-stopping video ads in minutes, not days.',
  keywords: [
    'video ads',
    'ad maker',
    'video ad creator',
    'AI ad copy',
    'social media ads',
    'ad rendering',
    'video overlay',
    'ad funnel',
    'TOFU MOFU BOFU',
    'batch video render',
  ],
  authors: [{ name: 'Ad Maker' }],
  creator: 'Ad Maker',
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    siteName: 'Ad Maker',
    title: 'Ad Maker — Create Scroll-Stopping Video Ads',
    description:
      'AI-powered ad copy generation, video rendering with timed overlays, and team collaboration. Create scroll-stopping video ads in minutes, not days.',
    url: BASE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ad Maker — Create Scroll-Stopping Video Ads',
    description:
      'AI-powered video ad creation with timed text overlays, batch rendering, and team collaboration.',
  },
  manifest: '/manifest.json',
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: '#030712',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
