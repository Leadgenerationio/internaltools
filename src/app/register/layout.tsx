import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Get Started',
  description: 'Create your free Ad Maker account and start making scroll-stopping video ads in minutes.',
  openGraph: {
    title: 'Get Started — Ad Maker',
    description: 'Create your free Ad Maker account. 40 tokens included — no credit card required.',
  },
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
