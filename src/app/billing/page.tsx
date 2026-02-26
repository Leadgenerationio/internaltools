'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';

interface BillingData {
  plan: string;
  monthlyTotalCents: number;
  monthlyBudgetCents: number | null;
}

const PLANS = [
  {
    key: 'FREE',
    label: 'Free',
    price: 0,
    features: ['10 generations / month', '1 user', '5 GB storage'],
  },
  {
    key: 'STARTER',
    label: 'Starter',
    price: 2900,
    features: ['100 generations / month', '5 users', '50 GB storage'],
    popular: true,
  },
  {
    key: 'PRO',
    label: 'Pro',
    price: 9900,
    features: ['Unlimited generations', 'Unlimited users', '500 GB storage'],
  },
  {
    key: 'ENTERPRISE',
    label: 'Enterprise',
    price: null,
    features: ['Custom limits', 'Custom integrations', 'Dedicated support'],
  },
];

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

export default function BillingPage() {
  const { status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    if (status !== 'authenticated') return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    fetch('/api/usage?days=30', { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        setData({
          plan: d.plan || 'FREE',
          monthlyTotalCents: d.monthlyTotalCents || 0,
          monthlyBudgetCents: d.monthlyBudgetCents,
        });
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.error('Billing load error:', err);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [status, router]);

  if (status === 'loading' || loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </main>
    );
  }

  const currentPlan = data?.plan || 'FREE';

  return (
    <main className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-white text-sm">&larr; Back</Link>
            <h1 className="text-xl font-bold text-white">Billing & Plans</h1>
          </div>
          <UserMenu />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Current plan summary */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-sm text-gray-400">Current Plan</p>
              <p className="text-2xl font-bold text-white mt-1">{currentPlan}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">This Month&apos;s Spend</p>
              <p className="text-2xl font-bold text-white mt-1">
                {formatPence(data?.monthlyTotalCents || 0)}
              </p>
            </div>
            {data?.monthlyBudgetCents && (
              <div>
                <p className="text-sm text-gray-400">Monthly Budget</p>
                <p className="text-2xl font-bold text-white mt-1">
                  {formatPence(data.monthlyBudgetCents)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Plan cards */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Available Plans</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLANS.map((plan) => {
              const isCurrent = plan.key === currentPlan;
              return (
                <div
                  key={plan.key}
                  className={`relative rounded-xl p-5 flex flex-col ${
                    isCurrent
                      ? 'bg-blue-950/30 border-2 border-blue-500'
                      : plan.popular
                      ? 'bg-gray-800 border-2 border-gray-600'
                      : 'bg-gray-800 border border-gray-700'
                  }`}
                >
                  {plan.popular && !isCurrent && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-blue-500 text-[10px] font-semibold text-white">
                      Popular
                    </div>
                  )}
                  {isCurrent && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-green-600 text-[10px] font-semibold text-white">
                      Current
                    </div>
                  )}

                  <h3 className="text-lg font-semibold text-white">{plan.label}</h3>
                  <div className="mt-2 mb-4">
                    {plan.price !== null ? (
                      <span className="text-3xl font-extrabold text-white">
                        {formatPence(plan.price)}
                        <span className="text-sm font-normal text-gray-500">/mo</span>
                      </span>
                    ) : (
                      <span className="text-lg font-semibold text-gray-400">Custom pricing</span>
                    )}
                  </div>

                  <ul className="space-y-2 mb-5 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                        <svg className="w-4 h-4 mt-0.5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <div className="text-center py-2 text-sm text-gray-400">Current plan</div>
                  ) : plan.key === 'ENTERPRISE' ? (
                    <button className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors">
                      Contact Us
                    </button>
                  ) : (
                    <button className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
                      {plan.price === 0 ? 'Downgrade' : 'Upgrade'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-4 text-center">
            Stripe payment integration coming soon. Plan changes are currently managed by your admin.
          </p>
        </div>

        {/* Usage link */}
        <div className="flex gap-3">
          <Link
            href="/usage"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg border border-gray-700 transition-colors"
          >
            View Detailed Usage
          </Link>
          <Link
            href="/settings"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg border border-gray-700 transition-colors"
          >
            Team Settings
          </Link>
        </div>
      </div>
    </main>
  );
}
