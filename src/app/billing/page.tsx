'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import Tooltip from '@/components/Tooltip';

interface BillingData {
  tokenBalance: number;
  monthlyTokensUsed: number;
  monthlyAllocation: number;
  plan: string;
  topupEnabled: boolean;
}

interface TopupPackage {
  id: string;
  label: string;
  tokens: number;
  pricePence: number;
}

const PLANS = [
  {
    key: 'FREE',
    label: 'Free',
    price: 0,
    tokens: 40,
    features: [
      '40 tokens / month',
      '~40 finished ad videos',
      '1 user',
      'AI ad copy generation (free)',
      '5 GB storage',
    ],
  },
  {
    key: 'STARTER',
    label: 'Starter',
    price: 2900,
    tokens: 500,
    features: [
      '500 tokens / month',
      '~500 finished ad videos',
      '5 users',
      'AI ad copy generation (free)',
      '50 GB storage',
      'Token top-ups available',
    ],
    popular: true,
  },
  {
    key: 'PRO',
    label: 'Pro',
    price: 9900,
    tokens: 2500,
    features: [
      '2,500 tokens / month',
      '~2,500 finished ad videos',
      'Unlimited users',
      'AI ad copy generation (free)',
      '500 GB storage',
      'Cheapest top-up rate',
    ],
  },
  {
    key: 'ENTERPRISE',
    label: 'Enterprise',
    price: null,
    tokens: null,
    features: [
      'Custom token allocation',
      'Custom integrations',
      'Dedicated support',
      'Volume discounts',
    ],
  },
];

export default function BillingPage() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [manageLoading, setManageLoading] = useState(false);
  const [topupPackages, setTopupPackages] = useState<TopupPackage[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const successTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-dismiss success messages after 5 seconds
  const showSuccess = useCallback((msg: string) => {
    setSuccessMessage(msg);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => setSuccessMessage(null), 5000);
  }, []);

  // Check for checkout result in URL params
  useEffect(() => {
    const checkout = searchParams.get('checkout');
    if (checkout === 'success') {
      const plan = searchParams.get('plan');
      const topup = searchParams.get('topup');
      if (plan) {
        showSuccess(`Successfully subscribed to the ${plan} plan! Your tokens have been credited.`);
      } else if (topup) {
        showSuccess(`Token top-up purchased successfully! Your tokens have been credited.`);
      } else {
        showSuccess('Payment completed successfully!');
      }
      // Clean up URL params without navigation
      const url = new URL(window.location.href);
      url.searchParams.delete('checkout');
      url.searchParams.delete('plan');
      url.searchParams.delete('topup');
      window.history.replaceState({}, '', url.pathname);
    } else if (checkout === 'cancelled') {
      setErrorMessage('Checkout was cancelled.');
      const url = new URL(window.location.href);
      url.searchParams.delete('checkout');
      window.history.replaceState({}, '', url.pathname);
    }
  }, [searchParams, showSuccess]);

  // Fetch billing data
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    if (status !== 'authenticated') return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    fetch('/api/billing/balance', { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        setData({
          tokenBalance: d.tokenBalance || 0,
          monthlyTokensUsed: d.monthlyTokensUsed || 0,
          monthlyAllocation: d.monthlyAllocation || 0,
          plan: d.plan || 'FREE',
          topupEnabled: d.topupEnabled || false,
        });

        // Calculate top-up prices based on plan
        if (d.topupEnabled) {
          const planTopupRates: Record<string, number> = {
            STARTER: 10, // 10p per token
            PRO: 8, // 8p per token
          };
          const rate = planTopupRates[d.plan] || 10;
          setTopupPackages([
            { id: 'small', label: 'Small', tokens: 50, pricePence: 50 * rate },
            { id: 'medium', label: 'Medium', tokens: 150, pricePence: 150 * rate },
            { id: 'large', label: 'Large', tokens: 500, pricePence: 500 * rate },
          ]);
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.error('Billing load error:', err);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [status, router]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  const handleUpgrade = async (planKey: string) => {
    setCheckoutLoading(planKey);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planKey }),
      });

      const result = await res.json();

      if (!res.ok) {
        setErrorMessage(result.error || 'Failed to create checkout session');
        return;
      }

      if (result.url) {
        window.location.href = result.url;
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleTopup = async (packageId: string) => {
    setCheckoutLoading(`topup-${packageId}`);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topupPackageId: packageId }),
      });

      const result = await res.json();

      if (!res.ok) {
        setErrorMessage(result.error || 'Failed to create checkout session');
        return;
      }

      if (result.url) {
        window.location.href = result.url;
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    setManageLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/billing/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await res.json();

      if (!res.ok) {
        setErrorMessage(result.error || 'Failed to open billing portal');
        return;
      }

      if (result.url) {
        window.location.href = result.url;
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error');
    } finally {
      setManageLoading(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </main>
    );
  }

  const currentPlan = data?.plan || 'FREE';
  const isPaidPlan = currentPlan !== 'FREE';
  const usagePct = data && data.monthlyAllocation > 0
    ? Math.min((data.monthlyTokensUsed / data.monthlyAllocation) * 100, 100)
    : 0;

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
        {/* Success / Error banners */}
        {successMessage && (
          <div className="bg-green-900/40 border border-green-700 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm text-green-200">{successMessage}</p>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="text-green-400 hover:text-green-300">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="bg-red-900/40 border border-red-700 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />
              </svg>
              <p className="text-sm text-red-200">{errorMessage}</p>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-red-300">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Token balance summary */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-sm text-gray-400 flex items-center">
                Token Balance
                <Tooltip text="Your available tokens. Each finished ad video costs 1 token. AI-generated videos cost 10 tokens (includes all renders)." />
              </p>
              <p className="text-3xl font-bold text-white mt-1">
                {data?.tokenBalance.toLocaleString() || 0}
                <span className="text-sm font-normal text-gray-500 ml-1">tokens</span>
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-400 flex items-center">
                Used This Month
                <Tooltip text="Tokens used in the current billing month. Resets at the start of each month when your plan allocation is refreshed." />
              </p>
              <p className="text-2xl font-bold text-white mt-1">
                {data?.monthlyTokensUsed.toLocaleString() || 0}
                <span className="text-sm font-normal text-gray-500 ml-1">
                  / {data?.monthlyAllocation.toLocaleString() || 0}
                </span>
              </p>
              {data && data.monthlyAllocation > 0 && (
                <div className="mt-2 w-48">
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        usagePct > 80 ? 'bg-red-500' : usagePct > 50 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${usagePct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div>
                <p className="text-sm text-gray-400">Current Plan</p>
                <p className="text-2xl font-bold text-white mt-1">{currentPlan}</p>
              </div>
              {isPaidPlan && (
                <button
                  onClick={handleManageSubscription}
                  disabled={manageLoading}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg border border-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {manageLoading ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Loading...
                    </span>
                  ) : (
                    'Manage Subscription'
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Token cost explainer */}
        <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700/60">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">How Tokens Work</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-green-400 font-bold">FREE</span>
              <span className="text-gray-400">AI ad copy generation &mdash; create and regenerate ad scripts at no cost</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-400 font-bold">1 token</span>
              <span className="text-gray-400">= 1 finished ad video rendered with your own background video</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-purple-400 font-bold">10 tokens</span>
              <span className="text-gray-400">= 1 AI-generated video (Veo) including all renders onto it</span>
            </div>
          </div>
        </div>

        {/* Plan cards */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Available Plans</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLANS.map((plan) => {
              const isCurrent = plan.key === currentPlan;
              const isLoading = checkoutLoading === plan.key;
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
                  <div className="mt-2 mb-1">
                    {plan.price !== null ? (
                      <span className="text-3xl font-extrabold text-white">
                        &pound;{(plan.price / 100).toFixed(0)}
                        <span className="text-sm font-normal text-gray-500">/mo</span>
                      </span>
                    ) : (
                      <span className="text-lg font-semibold text-gray-400">Custom pricing</span>
                    )}
                  </div>
                  {plan.tokens !== null && (
                    <p className="text-xs text-blue-400 mb-3">{plan.tokens.toLocaleString()} tokens/month</p>
                  )}

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
                  ) : plan.key === 'FREE' ? (
                    isPaidPlan ? (
                      <button
                        onClick={handleManageSubscription}
                        disabled={manageLoading}
                        className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                      >
                        Manage Subscription to Downgrade
                      </button>
                    ) : (
                      <div className="text-center py-2 text-sm text-gray-400">Current plan</div>
                    )
                  ) : (
                    <button
                      onClick={() => handleUpgrade(plan.key)}
                      disabled={isLoading || checkoutLoading !== null}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Redirecting...
                        </span>
                      ) : (
                        'Upgrade'
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Token Top-Up Section */}
        {isPaidPlan && data?.topupEnabled && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-2 flex items-center">
            Top Up Tokens
            <Tooltip text="Buy extra tokens instantly. Top-up tokens don't expire and stack on top of your monthly allocation." />
          </h2>
            <p className="text-sm text-gray-400 mb-4">
              Need more tokens? Purchase a top-up package. Tokens are credited instantly after payment.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {topupPackages.map((pkg) => {
                const isLoading = checkoutLoading === `topup-${pkg.id}`;
                return (
                  <div
                    key={pkg.id}
                    className="bg-gray-800 rounded-xl p-5 border border-gray-700 flex flex-col"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold text-white">{pkg.label}</h3>
                      <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-semibold">
                        {pkg.tokens} tokens
                      </span>
                    </div>
                    <div className="mb-4">
                      <span className="text-2xl font-extrabold text-white">
                        &pound;{(pkg.pricePence / 100).toFixed(2)}
                      </span>
                      <span className="text-sm text-gray-500 ml-1">one-time</span>
                    </div>
                    <p className="text-xs text-gray-500 mb-4">
                      {(pkg.pricePence / pkg.tokens).toFixed(0)}p per token
                    </p>
                    <button
                      onClick={() => handleTopup(pkg.id)}
                      disabled={isLoading || checkoutLoading !== null}
                      className="w-full py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-auto"
                    >
                      {isLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Redirecting...
                        </span>
                      ) : (
                        'Buy Now'
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Not on a paid plan — nudge to upgrade for top-ups */}
        {!isPaidPlan && (
          <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700/60 text-center">
            <p className="text-sm text-gray-400">
              Upgrade to Starter or Pro to unlock token top-up purchases.
            </p>
          </div>
        )}

        {/* Usage link */}
        <div className="flex gap-3">
          <Link
            href="/usage"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg border border-gray-700 transition-colors"
          >
            View Token Usage
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
