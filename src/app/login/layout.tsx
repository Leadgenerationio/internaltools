import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to your Ad Maker account to create and manage video ads.',
  openGraph: {
    title: 'Sign In — Ad Maker',
    description: 'Sign in to your Ad Maker account.',
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
