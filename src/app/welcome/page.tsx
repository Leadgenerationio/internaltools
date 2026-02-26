import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ad Maker — Create Scroll-Stopping Video Ads in Minutes',
  description:
    'AI-powered ad copy generation, video rendering, and team collaboration. Generate funnel-optimised ad scripts, render 1080x1920 video ads with overlays, and manage your team — all in one platform.',
};

const features = [
  {
    title: 'AI Ad Copy',
    description:
      'Generate 10 funnel-optimised ad scripts in seconds with Claude AI. TOFU, MOFU, BOFU — all covered.',
    icon: 'AI',
    iconBg: 'bg-purple-500/20',
    iconText: 'text-purple-400',
  },
  {
    title: 'Video Rendering',
    description:
      'Upload background videos, add timed text overlays with emoji support, batch render at 1080x1920.',
    icon: 'HD',
    iconBg: 'bg-blue-500/20',
    iconText: 'text-blue-400',
  },
  {
    title: 'Team Collaboration',
    description:
      'Invite your team, track token usage per user, set budgets, manage roles.',
    icon: 'T',
    iconBg: 'bg-green-500/20',
    iconText: 'text-green-400',
  },
  {
    title: 'Smart Trimming',
    description:
      'Trim videos, choose draft or final quality, download individually or as ZIP.',
    icon: 'ST',
    iconBg: 'bg-amber-500/20',
    iconText: 'text-amber-400',
  },
  {
    title: 'Token System',
    description:
      'Simple token-based billing. 1 token = 1 finished video. Track usage, set budgets, buy top-ups.',
    icon: 'TK',
    iconBg: 'bg-rose-500/20',
    iconText: 'text-rose-400',
  },
  {
    title: 'Cloud Ready',
    description:
      'Deploy anywhere. Optional S3/R2 storage for production. Docker-ready for Railway.',
    icon: 'CR',
    iconBg: 'bg-cyan-500/20',
    iconText: 'text-cyan-400',
  },
];

const pricingTiers = [
  {
    name: 'Free',
    price: '0',
    description: 'For individuals getting started',
    features: [
      '40 tokens / month (~40 videos)',
      'Unlimited AI ad copy',
      '1 user',
      '5 GB storage',
    ],
    cta: 'Get Started Free',
    ctaHref: '/register',
    highlighted: false,
  },
  {
    name: 'Starter',
    price: '29',
    description: 'For small teams shipping ads weekly',
    features: [
      '500 tokens / month (~500 videos)',
      'Unlimited AI ad copy',
      '5 users',
      '50 GB storage',
      'Token top-ups available',
    ],
    cta: 'Start Free Trial',
    ctaHref: '/register',
    highlighted: true,
  },
  {
    name: 'Pro',
    price: '99',
    description: 'For agencies that need to ship fast',
    features: [
      '2,500 tokens / month (~2,500 videos)',
      'Unlimited AI ad copy',
      'Unlimited users',
      '500 GB storage',
      'Cheapest top-up rate',
    ],
    cta: 'Start Free Trial',
    ctaHref: '/register',
    highlighted: false,
  },
];

export default function WelcomePage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Navigation */}
      <nav className="border-b border-gray-800/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <span className="text-lg font-bold tracking-tight">Ad Maker</span>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Subtle gradient backdrop */}
        <div className="absolute inset-0 bg-gradient-to-b from-blue-600/5 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 sm:pt-28 sm:pb-32 text-center relative">
          <div className="inline-block mb-6 px-4 py-1.5 rounded-full border border-gray-700 bg-gray-800/50 text-xs text-gray-400 font-medium tracking-wide uppercase">
            AI-Powered Ad Creation
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight">
            Create Scroll-Stopping
            <br />
            <span className="text-blue-500">Video Ads</span> in Minutes
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            AI-powered ad copy generation, video rendering, and team
            collaboration — all in one platform.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-semibold text-sm transition-colors"
            >
              Get Started Free
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white font-semibold text-sm transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 sm:py-24 border-t border-gray-800/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Everything you need to ship ads
            </h2>
            <p className="mt-4 text-gray-400 text-lg max-w-xl mx-auto">
              From AI-generated scripts to rendered videos, all in one workflow.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group bg-gray-800/50 border border-gray-700/60 rounded-2xl p-6 hover:border-gray-600 transition-colors"
              >
                <div
                  className={`w-10 h-10 rounded-lg ${feature.iconBg} flex items-center justify-center mb-4`}
                >
                  <span
                    className={`text-xs font-bold ${feature.iconText}`}
                  >
                    {feature.icon}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 sm:py-24 border-t border-gray-800/40 bg-gray-900/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Four steps. That&apos;s it.
            </h2>
            <p className="mt-4 text-gray-400 text-lg">
              From brief to rendered video ads in minutes, not days.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              {
                step: '1',
                title: 'Write your brief',
                desc: 'Describe your product, audience, and goals. Or let AI suggest it.',
              },
              {
                step: '2',
                title: 'Review AI scripts',
                desc: 'Claude generates TOFU, MOFU, and BOFU ad scripts. Edit or approve them.',
              },
              {
                step: '3',
                title: 'Add your media',
                desc: 'Upload background videos, choose music, configure text styles.',
              },
              {
                step: '4',
                title: 'Render and download',
                desc: 'Batch render all combinations. Download individually or as a ZIP.',
              },
            ].map((item) => (
              <div
                key={item.step}
                className="flex gap-4 bg-gray-800/30 border border-gray-700/40 rounded-xl p-5"
              >
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <span className="text-sm font-bold text-blue-400">
                    {item.step}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">
                    {item.title}
                  </h3>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 sm:py-24 border-t border-gray-800/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-gray-400 text-lg max-w-xl mx-auto">
              Start free. Upgrade when you need more power.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {pricingTiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-2xl p-6 flex flex-col ${
                  tier.highlighted
                    ? 'bg-gray-800/80 border-2 border-blue-500 shadow-lg shadow-blue-500/10'
                    : 'bg-gray-800/50 border border-gray-700/60'
                }`}
              >
                {tier.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-blue-500 text-xs font-semibold text-white">
                    Most Popular
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-white">
                    {tier.name}
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">
                    {tier.description}
                  </p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold text-white">
                      &pound;{tier.price}
                    </span>
                    <span className="text-sm text-gray-500">/month</span>
                  </div>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {tier.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm text-gray-300"
                    >
                      <svg
                        className="w-4 h-4 mt-0.5 text-green-500 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href={tier.ctaHref}
                  className={`w-full inline-flex items-center justify-center py-3 rounded-xl font-semibold text-sm transition-colors ${
                    tier.highlighted
                      ? 'bg-blue-600 hover:bg-blue-500 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white'
                  }`}
                >
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800/60 py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="text-center sm:text-left">
              <span className="text-sm font-semibold text-white">
                Ad Maker
              </span>
              <p className="text-xs text-gray-500 mt-1">
                Built for agencies that need to ship ads fast.
              </p>
            </div>
            <nav className="flex items-center gap-6 text-sm text-gray-500">
              <Link
                href="/login"
                className="hover:text-gray-300 transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="hover:text-gray-300 transition-colors"
              >
                Register
              </Link>
              <Link
                href="#"
                className="hover:text-gray-300 transition-colors"
              >
                Privacy
              </Link>
              <Link
                href="#"
                className="hover:text-gray-300 transition-colors"
              >
                Terms
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </main>
  );
}
