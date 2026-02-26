import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Help & Support — Ad Maker',
  description:
    'Get help with Ad Maker. Search FAQs on getting started, token billing, features, team management, and troubleshooting.',
};

export default function HelpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
