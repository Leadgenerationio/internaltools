import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ad Maker — Create Scroll-Stopping Video Ads in Minutes',
  description:
    'AI-powered ad copy generation, video rendering, and team collaboration. Generate funnel-optimised ad scripts, render 1080x1920 video ads with overlays, and manage your team — all in one platform.',
};

/* -------------------------------------------------------------------------- */
/*  Data                                                                      */
/* -------------------------------------------------------------------------- */

const features = [
  {
    title: 'AI-Powered Ad Copy',
    description:
      'Claude AI writes full-funnel ad scripts in seconds. TOFU awareness hooks, MOFU consideration angles, BOFU conversion closers — ten variations, one click.',
    iconBg: 'bg-purple-500/20',
    iconColor: 'text-purple-400',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
      </svg>
    ),
  },
  {
    title: 'Video Ad Creation',
    description:
      'Upload your own background videos or generate them with Google Veo AI. Text overlays, music, and transitions are added automatically at 1080x1920.',
    iconBg: 'bg-blue-500/20',
    iconColor: 'text-blue-400',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 016 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m-12 5.25v-5.25m0 5.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125m-12 0v-1.5c0-.621-.504-1.125-1.125-1.125M18 18.375v-5.25m0 5.25v-1.5c0-.621.504-1.125 1.125-1.125M18 13.125v1.5c0 .621.504 1.125 1.125 1.125M18 13.125c0-.621.504-1.125 1.125-1.125M6 13.125v1.5c0 .621-.504 1.125-1.125 1.125M6 13.125C6 12.504 5.496 12 4.875 12m-1.5 0h1.5m-1.5 0c-.621 0-1.125-.504-1.125-1.125v-1.5c0-.621.504-1.125 1.125-1.125m1.5 3.75c-.621 0-1.125-.504-1.125-1.125v-1.5c0-.621.504-1.125 1.125-1.125" />
      </svg>
    ),
  },
  {
    title: 'Google Drive Export',
    description:
      'Send finished ads straight to your Google Drive with one click. Organise by campaign, share with clients, keep everything in sync.',
    iconBg: 'bg-green-500/20',
    iconColor: 'text-green-400',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
      </svg>
    ),
  },
  {
    title: 'Team Collaboration',
    description:
      'Invite your team with role-based access. Track token usage per member, set budgets, and keep everyone aligned on brand and goals.',
    iconBg: 'bg-amber-500/20',
    iconColor: 'text-amber-400',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
  },
  {
    title: 'Project Templates',
    description:
      'Start from six built-in templates for common ad formats, or save your own. Reuse briefs, styles, and overlay configs across campaigns.',
    iconBg: 'bg-rose-500/20',
    iconColor: 'text-rose-400',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    title: 'Token-Based Billing',
    description:
      'Transparent pay-as-you-go pricing. One token, one rendered video. No hidden fees, no per-seat surprises. Buy top-ups any time.',
    iconBg: 'bg-cyan-500/20',
    iconColor: 'text-cyan-400',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
  },
];

const steps = [
  {
    number: '01',
    title: 'Write Your Brief',
    description: 'Describe your product, target audience, and campaign goals. Pick a funnel stage or let AI handle all three.',
    accent: 'from-blue-500 to-blue-600',
  },
  {
    number: '02',
    title: 'Review AI Scripts',
    description: 'Claude generates ten ad variations across TOFU, MOFU, and BOFU. Edit inline, approve the ones you want, discard the rest.',
    accent: 'from-purple-500 to-purple-600',
  },
  {
    number: '03',
    title: 'Add Your Media',
    description: 'Upload background videos or generate them with AI. Choose music, configure text overlays, set timing and styles.',
    accent: 'from-amber-500 to-amber-600',
  },
  {
    number: '04',
    title: 'Render & Export',
    description: 'Batch render every ad-video combination at 1080x1920. Download as ZIP or send straight to Google Drive.',
    accent: 'from-green-500 to-green-600',
  },
];

const pricingTiers = [
  {
    name: 'Free',
    price: '0',
    period: '/month',
    description: 'For individuals exploring the platform',
    features: [
      '40 tokens per month',
      'AI ad copy generation',
      '1 user',
      '5 GB storage',
      'Community support',
    ],
    cta: 'Get Started Free',
    ctaHref: '/register',
    highlighted: false,
  },
  {
    name: 'Starter',
    price: '29',
    period: '/month',
    description: 'For small teams shipping ads weekly',
    features: [
      '500 tokens per month',
      'AI ad copy generation',
      '5 users',
      '50 GB storage',
      'Google Drive export',
      'Token top-ups available',
      'Priority support',
    ],
    cta: 'Start Free Trial',
    ctaHref: '/register',
    highlighted: true,
  },
  {
    name: 'Pro',
    price: '99',
    period: '/month',
    description: 'For agencies that need to ship at scale',
    features: [
      '2,500 tokens per month',
      'AI ad copy generation',
      'Unlimited users',
      '500 GB storage',
      'Google Drive export',
      'Lowest top-up rate',
      'Custom templates',
      'Dedicated support',
    ],
    cta: 'Start Free Trial',
    ctaHref: '/register',
    highlighted: false,
  },
];

const testimonials = [
  {
    quote: 'We went from spending two days on ad creatives to shipping a full funnel in under an hour. The AI copy alone saved us ten hours a week.',
    name: 'Sarah Chen',
    role: 'Head of Growth, ScaleUp Agency',
  },
  {
    quote: 'The batch rendering is a game-changer. We test twenty variations per campaign now instead of three. Our ROAS has never been higher.',
    name: 'Marcus Rivera',
    role: 'Performance Marketing Lead, DTC Brands Co',
  },
  {
    quote: 'Onboarding our team of eight took fifteen minutes. The token system keeps costs predictable and the Drive export keeps clients happy.',
    name: 'Priya Sharma',
    role: 'Founder, Forge Creative',
  },
];

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function WelcomePage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white antialiased">
      {/* ------------------------------------------------------------------ */}
      {/*  Navigation                                                        */}
      {/* ------------------------------------------------------------------ */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/welcome" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight">Ad Maker</span>
          </Link>

          <div className="hidden sm:flex items-center gap-8">
            <a href="#features" className="text-sm text-gray-400 hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="text-sm text-gray-400 hover:text-white transition-colors">How It Works</a>
            <a href="#pricing" className="text-sm text-gray-400 hover:text-white transition-colors">Pricing</a>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm text-gray-400 hover:text-white transition-colors px-3 py-2"
            >
              Log In
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

      {/* ------------------------------------------------------------------ */}
      {/*  Hero Section                                                      */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative overflow-hidden pt-16">
        {/* Background effects */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-blue-500/[0.07] rounded-full blur-[120px]" />
          <div className="absolute top-40 left-1/4 w-[400px] h-[400px] bg-purple-500/[0.05] rounded-full blur-[100px]" />
          <div className="absolute top-60 right-1/4 w-[300px] h-[300px] bg-green-500/[0.04] rounded-full blur-[80px]" />
        </div>

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 sm:pt-28 sm:pb-32 text-center">
          <div className="inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-full border border-gray-700/80 bg-gray-800/60 text-sm text-gray-300 font-medium backdrop-blur-sm">
            <span className="flex h-2 w-2 rounded-full bg-green-500">
              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75" />
            </span>
            Now with Google Veo AI video generation
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1]">
            Stop Guessing.
            <br />
            Start Shipping{' '}
            <span className="bg-gradient-to-r from-blue-400 via-blue-500 to-purple-500 bg-clip-text text-transparent">
              Winning Ads.
            </span>
          </h1>

          <p className="mt-6 sm:mt-8 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Generate full-funnel ad copy with AI, render scroll-stopping video ads
            in minutes, and ship campaigns your team can actually keep up with.
          </p>

          <div className="mt-10 sm:mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-green-600 hover:bg-green-500 text-white font-semibold text-base transition-all hover:shadow-lg hover:shadow-green-500/20"
            >
              Get Started Free
              <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
            <a
              href="#how-it-works"
              className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700 text-gray-300 hover:text-white font-semibold text-base transition-all"
            >
              <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" />
              </svg>
              Watch Demo
            </a>
          </div>

          {/* Trust indicators */}
          <div className="mt-14 sm:mt-16 flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              No credit card required
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Set up in under 2 minutes
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              40 free tokens included
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Logos / Social Proof Bar                                          */}
      {/* ------------------------------------------------------------------ */}
      <section className="border-t border-b border-gray-800/40 py-10 sm:py-12 bg-gray-900/20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs uppercase tracking-widest text-gray-500 font-medium mb-8">
            Trusted by performance marketing teams worldwide
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 text-gray-600">
            {['ScaleUp Agency', 'Forge Creative', 'DTC Brands Co', 'Paid Social Lab', 'AdFlow Studio'].map((name) => (
              <span key={name} className="text-lg sm:text-xl font-bold tracking-tight opacity-40 hover:opacity-60 transition-opacity">
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Features Section                                                  */}
      {/* ------------------------------------------------------------------ */}
      <section id="features" className="py-24 sm:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 sm:mb-20">
            <p className="text-sm font-semibold uppercase tracking-widest text-blue-400 mb-3">Features</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
              Everything You Need to Ship Ads
            </h2>
            <p className="mt-5 text-gray-400 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed">
              From AI-generated scripts to rendered videos and cloud export, the entire workflow lives in one place.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group relative bg-gray-900/60 border border-gray-800 rounded-2xl p-7 hover:border-gray-700 hover:bg-gray-800/60 transition-all duration-300"
              >
                <div className={`w-12 h-12 rounded-xl ${feature.iconBg} flex items-center justify-center mb-5 ${feature.iconColor} group-hover:scale-110 transition-transform duration-300`}>
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-white mb-2.5">
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

      {/* ------------------------------------------------------------------ */}
      {/*  How It Works Section                                              */}
      {/* ------------------------------------------------------------------ */}
      <section id="how-it-works" className="py-24 sm:py-32 bg-gray-900/30 border-t border-b border-gray-800/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 sm:mb-20">
            <p className="text-sm font-semibold uppercase tracking-widest text-blue-400 mb-3">How It Works</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
              Four Steps. That&apos;s It.
            </h2>
            <p className="mt-5 text-gray-400 text-lg sm:text-xl max-w-xl mx-auto">
              From brief to rendered video ads in minutes, not days.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 max-w-4xl mx-auto">
            {steps.map((step, idx) => (
              <div
                key={step.number}
                className="relative bg-gray-900/60 border border-gray-800 rounded-2xl p-7 hover:border-gray-700 transition-colors group"
              >
                {/* Connector line (desktop) */}
                {idx < steps.length - 1 && idx % 2 === 0 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 lg:-right-5 w-6 lg:w-8 border-t border-dashed border-gray-700" />
                )}

                <div className="flex items-start gap-5">
                  <div className={`flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br ${step.accent} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    <span className="text-sm font-bold text-white">{step.number}</span>
                  </div>
                  <div className="pt-0.5">
                    <h3 className="text-lg font-semibold text-white mb-2">
                      {step.title}
                    </h3>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white font-medium text-sm transition-colors"
            >
              Try it yourself -- it&apos;s free
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Stats Bar                                                         */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: '10x', label: 'Faster than manual ad creation' },
              { value: '1080p', label: 'Vertical video output' },
              { value: '10+', label: 'AI-generated scripts per brief' },
              { value: '99.9%', label: 'Platform uptime' },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-3xl sm:text-4xl font-extrabold text-white">{stat.value}</div>
                <div className="mt-2 text-sm text-gray-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Testimonials Section                                              */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-24 sm:py-32 border-t border-gray-800/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold uppercase tracking-widest text-blue-400 mb-3">Testimonials</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
              Loved by Marketing Teams
            </h2>
            <p className="mt-5 text-gray-400 text-lg max-w-xl mx-auto">
              See what performance marketers and agency owners are saying.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
            {testimonials.map((t) => (
              <div
                key={t.name}
                className="bg-gray-900/60 border border-gray-800 rounded-2xl p-7 flex flex-col"
              >
                {/* Stars */}
                <div className="flex gap-1 mb-5">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <blockquote className="text-sm text-gray-300 leading-relaxed flex-1">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <div className="mt-6 pt-5 border-t border-gray-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 border border-gray-700 flex items-center justify-center">
                      <span className="text-xs font-bold text-gray-300">
                        {t.name.split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">{t.name}</div>
                      <div className="text-xs text-gray-500">{t.role}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Pricing Section                                                   */}
      {/* ------------------------------------------------------------------ */}
      <section id="pricing" className="py-24 sm:py-32 bg-gray-900/30 border-t border-gray-800/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 sm:mb-20">
            <p className="text-sm font-semibold uppercase tracking-widest text-blue-400 mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
              Simple, Transparent Pricing
            </h2>
            <p className="mt-5 text-gray-400 text-lg sm:text-xl max-w-xl mx-auto">
              Start free. Upgrade when you need more power. No surprises.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto items-stretch">
            {pricingTiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-2xl p-7 sm:p-8 flex flex-col transition-all duration-300 ${
                  tier.highlighted
                    ? 'bg-gray-800/90 border-2 border-blue-500 shadow-xl shadow-blue-500/10 scale-[1.02] md:scale-105'
                    : 'bg-gray-900/60 border border-gray-800 hover:border-gray-700'
                }`}
              >
                {tier.highlighted && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 text-xs font-semibold text-white shadow-lg">
                    Most Popular
                  </div>
                )}

                <div className="mb-7">
                  <h3 className="text-xl font-bold text-white">{tier.name}</h3>
                  <p className="text-sm text-gray-400 mt-1.5">{tier.description}</p>
                  <div className="mt-5 flex items-baseline gap-1">
                    <span className="text-5xl font-extrabold text-white">&pound;{tier.price}</span>
                    <span className="text-base text-gray-500">{tier.period}</span>
                  </div>
                </div>

                <ul className="space-y-3.5 mb-8 flex-1">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm text-gray-300">
                      <svg className="w-5 h-5 mt-0.5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href={tier.ctaHref}
                  className={`w-full inline-flex items-center justify-center py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 ${
                    tier.highlighted
                      ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30'
                      : 'bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white'
                  }`}
                >
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-gray-500 mt-10">
            All plans include unlimited AI ad copy generation. Tokens are used only for video rendering.
            <br className="hidden sm:inline" />{' '}
            Need a custom plan? <Link href="/register" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">Contact us</Link>.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Final CTA Section                                                 */}
      {/* ------------------------------------------------------------------ */}
      <section className="py-24 sm:py-32 border-t border-gray-800/40 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-blue-500/[0.06] rounded-full blur-[100px]" />
        </div>

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            Ready to Ship Better Ads, Faster?
          </h2>
          <p className="mt-5 text-gray-400 text-lg sm:text-xl max-w-xl mx-auto leading-relaxed">
            Join thousands of marketers who stopped guessing and started shipping.
            Your first 40 videos are on us.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 px-10 py-4 rounded-xl bg-green-600 hover:bg-green-500 text-white font-semibold text-base transition-all hover:shadow-lg hover:shadow-green-500/20"
            >
              Get Started Free
              <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 rounded-xl bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700 text-gray-300 hover:text-white font-semibold text-base transition-colors"
            >
              Log In
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/*  Footer                                                            */}
      {/* ------------------------------------------------------------------ */}
      <footer className="border-t border-gray-800/60 bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-12">
            {/* Brand column */}
            <div className="sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                  </svg>
                </div>
                <span className="text-sm font-bold text-white">Ad Maker</span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed max-w-xs">
                AI-powered video ad creation for performance marketing teams. Ship better ads, faster.
              </p>
            </div>

            {/* Product column */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Product</h4>
              <ul className="space-y-3">
                <li><a href="#features" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Features</a></li>
                <li><a href="#pricing" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Pricing</a></li>
                <li><a href="#how-it-works" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">How It Works</a></li>
                <li><Link href="/register" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Get Started</Link></li>
              </ul>
            </div>

            {/* Support column */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Support</h4>
              <ul className="space-y-3">
                <li><Link href="/help" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Help Centre</Link></li>
                <li><Link href="/login" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Log In</Link></li>
                <li><Link href="/register" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Register</Link></li>
              </ul>
            </div>

            {/* Legal column */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Legal</h4>
              <ul className="space-y-3">
                <li><Link href="/privacy" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Terms of Service</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-gray-800/60 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-gray-600">
              &copy; {new Date().getFullYear()} Ad Maker. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <Link href="/privacy" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">Privacy</Link>
              <Link href="/terms" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">Terms</Link>
              <Link href="/help" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">Help</Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
