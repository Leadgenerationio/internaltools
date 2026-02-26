import type { Metadata } from 'next';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'Billing & Plans',
  description: 'Manage your Ad Maker subscription, view token balance, and compare plans.',
  openGraph: {
    title: 'Billing & Plans — Ad Maker',
    description: 'Simple token-based billing. Start free, upgrade when you need more.',
  },
};

export default function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </main>
    }>
      {children}
    </Suspense>
  );
}
