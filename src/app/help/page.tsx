'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';

// ── Types ────────────────────────────────────────────────────────────────────

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQCategory {
  id: string;
  title: string;
  icon: string;
  items: FAQItem[];
}

// ── FAQ Data ─────────────────────────────────────────────────────────────────

const FAQ_CATEGORIES: FAQCategory[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: '\u{1F680}',
    items: [
      {
        question: 'What is Ad Maker?',
        answer:
          'Ad Maker is an AI-powered platform for creating scroll-stopping video ads. You write a brief describing your product, and our AI generates ad scripts optimised for different stages of the marketing funnel. Then you pair those scripts with background videos, customise the text overlay style, and render finished 1080x1920 vertical video ads ready for Facebook, Instagram, TikTok, and more.',
      },
      {
        question: 'How do I create my first ad?',
        answer:
          'After signing up, click "New Project" from the Projects page. You\'ll be guided through a 4-step workflow: (1) Write your brief describing what you\'re advertising, (2) Review and edit the AI-generated ad scripts, (3) Upload background videos and choose music, (4) Render your finished videos. The whole process can take as little as 5 minutes.',
      },
      {
        question: 'What is the 4-step workflow?',
        answer:
          'Ad Maker uses a simple 4-step process:\n\n**Step 1 - Brief:** Describe your product, target audience, key selling points, and desired tone. The more detail you give, the better the AI output.\n\n**Step 2 - Review:** The AI generates 10 ad scripts across three funnel stages. You can edit any text, approve the ones you like, regenerate individual scripts, or approve all at once.\n\n**Step 3 - Media:** Upload your own background videos (or generate them with AI), add background music, and customise text overlay styles including colours, fonts, and timing.\n\n**Step 4 - Render:** Hit render and Ad Maker creates a finished video for every combination of approved ads and uploaded videos. Download them individually or as a ZIP.',
      },
      {
        question: 'What are tokens and how do they work?',
        answer:
          'Tokens are the currency of Ad Maker. Every plan comes with a monthly token allocation. Rendering a finished video using your own uploaded footage costs 1 token. Generating an AI video with Veo costs 10 tokens. AI ad copy generation is completely free and unlimited. Your token balance resets at the start of each billing cycle.',
      },
    ],
  },
  {
    id: 'tokens-billing',
    title: 'Tokens & Billing',
    icon: '\u{1FA99}',
    items: [
      {
        question: 'How do tokens work?',
        answer:
          'Tokens are deducted before each operation begins. If the operation fails due to a system error (not a user error), your tokens are automatically refunded. Here\'s the breakdown:\n\n- **AI ad copy generation:** FREE (unlimited)\n- **Render 1 video** (your own footage): 1 token\n- **Generate 1 AI video** (via Google Veo): 10 tokens\n\nFor example, if you approve 5 ads and upload 2 background videos, rendering all combinations would cost 5 x 2 = 10 tokens.',
      },
      {
        question: 'What plans are available?',
        answer:
          'We offer three plans:\n\n**Free** - 40 tokens/month, 1 user, 5 GB storage. Great for trying out the platform.\n\n**Starter (\u00a329/month)** - 500 tokens/month, 5 users, 50 GB storage. Token top-ups available. Ideal for small teams shipping ads weekly.\n\n**Pro (\u00a399/month)** - 2,500 tokens/month, unlimited users, 500 GB storage. Cheapest top-up rate. Built for agencies that need to ship fast.',
      },
      {
        question: 'How do I buy more tokens?',
        answer:
          'If you\'re on the Starter or Pro plan, you can purchase token top-ups from the Billing page. Top-ups are available in Small, Medium, and Large packages at per-token rates that depend on your plan. Pro plan users get the cheapest rate. Top-up tokens don\'t expire at the end of your billing cycle \u2014 they stay in your balance until used.',
      },
      {
        question: 'What is the monthly token budget?',
        answer:
          'Account owners can set an optional monthly token budget in Settings. This acts as a spending cap to prevent your team from accidentally burning through tokens. You\'ll receive alerts at 50%, 80%, and 100% of your budget via webhook notifications. The budget is separate from your plan\'s token allocation \u2014 it\'s a safety limit you control.',
      },
      {
        question: 'What happens when I run out of tokens?',
        answer:
          'When your token balance reaches zero, you won\'t be able to render new videos or generate AI videos until your balance is replenished. You can still:\n\n- Generate and edit AI ad copy (always free)\n- Upload videos and music\n- Edit existing projects\n- Download previously rendered videos\n\nTokens are replenished at the start of each billing cycle, or you can purchase a top-up (Starter and Pro plans only).',
      },
      {
        question: 'Can I get a refund?',
        answer:
          'Subscriptions can be cancelled at any time and take effect at the end of the current billing period \u2014 no partial refunds for remaining time. Token top-ups are non-refundable once credited. If a render or AI video generation fails due to a system error, tokens are automatically refunded to your balance. If you believe you were charged in error, contact support within 14 days.',
      },
    ],
  },
  {
    id: 'features',
    title: 'Features & How-To',
    icon: '\u{2728}',
    items: [
      {
        question: 'How do I write an effective brief?',
        answer:
          'A good brief leads to better ad scripts. Here are tips for each field:\n\n**Product/Service:** Be specific. Instead of "fitness app", try "AI personal training app that creates custom 15-minute workouts based on your goals and available equipment".\n\n**Target Audience:** Describe who you\'re trying to reach. Age, interests, pain points, and behaviours all help. E.g. "Busy professionals aged 25-45 who want to stay fit but don\'t have time for the gym".\n\n**Key Selling Points:** List 3-5 unique benefits. Focus on outcomes, not features. "Lose weight without counting calories" beats "Calorie tracking feature".\n\n**Ad Examples:** Paste URLs or describe ads you\'ve seen that work well. This helps the AI match your desired style.\n\n**Tone/Style:** "Conversational and urgent", "Professional and data-driven", "Fun and relatable" \u2014 whatever matches your brand.\n\n**Additional Context:** Mention promotions, seasonal angles, competitor positioning, or anything else relevant.',
      },
      {
        question: 'What are funnel stages (TOFU/MOFU/BOFU)?',
        answer:
          'Funnel stages represent where your potential customer is in their buying journey:\n\n**TOFU (Top of Funnel) \u2014 Awareness:** These ads catch attention from people who don\'t know about your product yet. They use hooks, curiosity gaps, and relatable pain points. Think: "Stop scrolling if you\'ve ever..." or "The #1 mistake people make with...".\n\n**MOFU (Middle of Funnel) \u2014 Consideration:** These ads target people who are aware of the problem and exploring solutions. They build trust with social proof, education, and comparisons. Think: "Here\'s why 10,000+ people switched to..." or "3 things to look for in a...".\n\n**BOFU (Bottom of Funnel) \u2014 Conversion:** These ads push people who are ready to buy over the finish line. They use urgency, strong CTAs, and offers. Think: "Last chance: 50% off ends tonight" or "Join free for 7 days \u2014 no credit card needed".\n\nAd Maker generates 4 TOFU, 4 MOFU, and 2 BOFU scripts per brief, giving you coverage across the entire funnel.',
      },
      {
        question: 'Can I edit and regenerate ads?',
        answer:
          'Yes. In the Review step, every text box in every ad is fully editable \u2014 just click on the text and type. You can also:\n\n- **Regenerate a single ad:** Click the regenerate button on any ad card to get a fresh version from the AI, keeping all your other edits intact.\n- **Approve/reject individually:** Toggle each ad\'s approval status. Only approved ads move to the render step.\n- **Approve all:** One-click button to approve every ad at once.\n- **Copy text:** Copy any ad\'s full text to your clipboard for use elsewhere.',
      },
      {
        question: 'What video formats and sizes are supported?',
        answer:
          'Ad Maker supports most common video formats including MP4, MOV, WebM, and AVI. Each file can be up to 500 MB. Videos are automatically scaled and cropped to 1080x1920 (9:16 vertical) during rendering.\n\nFor best results:\n- Use high-resolution footage (1080p or higher)\n- Keep source videos between 5 and 60 seconds\n- Vertical (9:16) source footage works best, but horizontal footage will be cropped to fit\n- Avoid heavily compressed or low-bitrate source files',
      },
      {
        question: 'How does AI video generation with Veo work?',
        answer:
          'If you don\'t have your own footage, you can generate background videos using Google\'s Veo AI. In the Media step, switch to the "AI Generate" tab and describe the video you want. Veo will generate a short video clip based on your prompt.\n\nAI video generation costs 10 tokens per video. The generated video is then used exactly like an uploaded video \u2014 it gets paired with your approved ads and rendered with text overlays.\n\nTip: Be descriptive in your prompt. "Aerial drone shot of a modern city skyline at sunset with warm golden light" will produce better results than "city video".',
      },
      {
        question: 'How do overlay styles work?',
        answer:
          'Text overlays are the ad copy displayed on top of your background video. You can customise their appearance in the Media step:\n\n**Presets:** Choose from built-in styles like White Box, Dark Box, Gradient, or Minimal.\n\n**Custom controls:** Fine-tune text colour, background colour, opacity, font size, font weight, border radius, padding, max width, and text alignment.\n\n**Stagger timing:** Control how many seconds apart each text box appears. For example, if stagger is set to 2 seconds, the first text box appears at 0s, the second at 2s, the third at 4s, etc. Once a text box appears, it stays visible until the video ends.\n\n**Template library:** Save your favourite style configurations as templates for quick reuse across projects.',
      },
      {
        question: 'How does music work?',
        answer:
          'You can upload background music (MP3, WAV, AAC, M4A, OGG, or FLAC, up to 50 MB) in the Media step. Music controls include:\n\n- **Volume:** Adjust the music volume relative to the original video audio\n- **Fade in:** Gradually increase music volume at the start\n- **Fade out:** Gradually decrease music volume at the end\n\nAd Maker will warn you if your fade settings don\'t fit the video duration. Music is mixed with any existing video audio during rendering.',
      },
      {
        question: 'What is the difference between draft and final quality?',
        answer:
          'You can choose render quality before starting:\n\n**Draft:** Uses fast encoding settings (ultrafast preset, CRF 28). Renders quickly with slightly lower visual quality. Great for previewing your ads and making sure everything looks right before committing.\n\n**Final:** Uses higher-quality encoding (fast preset, CRF 23). Takes longer but produces sharper, more polished output suitable for running as actual ads.\n\nTip: Render in draft first to check everything, then re-render in final quality for the versions you want to use in campaigns.',
      },
      {
        question: 'How do I download my videos?',
        answer:
          'After rendering completes, each video has an individual download button. You can also click "Download All" to get a ZIP file containing every rendered video. Downloads are available as long as the project exists in your account.',
      },
    ],
  },
  {
    id: 'team-account',
    title: 'Team & Account',
    icon: '\u{1F465}',
    items: [
      {
        question: 'How do I manage team members?',
        answer:
          'Account Owners and Admins can manage team members from the Settings page (accessible via the user menu). You can:\n\n- **Invite new members:** Send an email invitation to join your company. The number of users you can invite depends on your plan (1 for Free, 5 for Starter, unlimited for Pro).\n- **Change roles:** Promote or demote team members between Admin and Member roles.\n- **Remove members:** Remove a team member from your company.',
      },
      {
        question: 'What are the user roles?',
        answer:
          '**Owner:** Full control over the company account. Can manage billing, settings, all team members, and all projects. There is one Owner per company (the person who created the account).\n\n**Admin:** Can manage team members, view usage analytics, adjust company settings, and access all projects. Cannot change billing or plan.\n\n**Member:** Can create and work on projects, view their own token usage, and download their rendered videos. Cannot access team management, billing, or company-wide analytics.',
      },
      {
        question: 'How do I change company settings?',
        answer:
          'Go to Settings (via the user menu) to manage:\n\n- **Monthly token budget:** Set a spending cap to prevent runaway token usage. Alerts fire at 50%, 80%, and 100% thresholds.\n- **Company logo:** Upload a logo displayed in your team\'s workspace.\n- **Team members:** Invite, manage roles, and remove team members.',
      },
      {
        question: 'How do I change my password?',
        answer:
          'If you\'re logged in, you can change your password from your account settings. If you\'ve forgotten your password, use the "Forgot password?" link on the login page. You\'ll receive a password reset link via email that\'s valid for a limited time.',
      },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    icon: '\u{1F527}',
    items: [
      {
        question: 'My video upload is failing',
        answer:
          'If your video upload fails, check the following:\n\n1. **File size:** Each video must be under 500 MB. Try compressing larger files with a tool like HandBrake.\n2. **File format:** Supported formats are MP4, MOV, WebM, and AVI. Convert other formats before uploading.\n3. **Network connection:** Large uploads need a stable connection. If your connection is unreliable, try a smaller file first.\n4. **Browser:** Use a modern browser (Chrome, Firefox, Safari, or Edge). Disable browser extensions that might interfere with uploads.\n\nIf the problem persists, try refreshing the page and uploading again. The upload will restart from the beginning.',
      },
      {
        question: 'My render is taking too long',
        answer:
          'Render time depends on several factors:\n\n- **Video length:** Longer videos take more time to process.\n- **Number of combinations:** If you have 5 ads and 3 videos, that\'s 15 renders. Each one takes time.\n- **Quality setting:** Final quality takes significantly longer than draft quality.\n- **Server load:** During peak usage, renders may queue.\n\n**Tips to speed things up:**\n- Use draft quality for previewing, final quality only for your top picks\n- Trim videos to remove unnecessary footage (use the trim controls in the preview)\n- Render fewer combinations by being selective about which ads you approve',
      },
      {
        question: 'I\'m getting an "Insufficient tokens" error',
        answer:
          'This means your token balance is too low for the operation you\'re attempting. Here\'s what to do:\n\n1. **Check your balance** on the Billing page (user menu > Billing & Plans).\n2. **Reduce scope:** Approve fewer ads or use fewer background videos to reduce the total token cost.\n3. **Wait for reset:** Your monthly allocation resets at the start of each billing cycle.\n4. **Buy a top-up:** If you\'re on Starter or Pro, you can purchase additional tokens from the Billing page.\n5. **Upgrade your plan:** If you consistently need more tokens, consider upgrading to a higher tier.\n\nRemember: AI ad copy generation is always free, so you can continue writing and editing scripts while waiting for tokens.',
      },
      {
        question: 'Which browsers are supported?',
        answer:
          'Ad Maker works best on the latest versions of:\n\n- **Google Chrome** (recommended)\n- **Mozilla Firefox**\n- **Apple Safari**\n- **Microsoft Edge**\n\nWe recommend using a desktop or laptop computer for the best experience. The platform is mobile-responsive, but video editing and preview features work best on larger screens.\n\nMake sure JavaScript is enabled and that ad blockers aren\'t interfering with the application.',
      },
      {
        question: 'My rendered video looks different from the preview',
        answer:
          'The in-app preview is a close approximation but may differ slightly from the final render. Common differences:\n\n- **Text positioning:** The preview uses CSS rendering while the actual render uses FFmpeg compositing. Minor positioning differences are normal.\n- **Cropping:** Horizontal videos are cropped to fit the 9:16 vertical format. The preview shows how this will look, but ensure important content is centred.\n- **Quality:** Draft renders will look noticeably softer than final renders. Always use final quality for production ads.\n\nIf the difference is significant, try adjusting your overlay style settings and rendering again.',
      },
    ],
  },
];

// ── Accordion Item Component ─────────────────────────────────────────────────

function AccordionItem({
  item,
  isOpen,
  onToggle,
}: {
  item: FAQItem;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border border-gray-700/60 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-800/50 transition-colors"
      >
        <span className="text-sm font-medium text-white pr-4">
          {item.question}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {isOpen && (
        <div className="px-5 pb-4 border-t border-gray-700/40">
          <div className="text-sm text-gray-300 leading-relaxed pt-3 whitespace-pre-line">
            {item.answer.split('\n').map((line, i) => {
              // Bold text: **text**
              const parts = line.split(/(\*\*[^*]+\*\*)/g);
              return (
                <span key={i}>
                  {i > 0 && <br />}
                  {parts.map((part, j) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                      return (
                        <strong key={j} className="text-white font-medium">
                          {part.slice(2, -2)}
                        </strong>
                      );
                    }
                    return <span key={j}>{part}</span>;
                  })}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Help Page ───────────────────────────────────────────────────────────

export default function HelpPage() {
  const [search, setSearch] = useState('');
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Filter FAQ items based on search query
  const filteredCategories = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return FAQ_CATEGORIES;

    return FAQ_CATEGORIES.map((category) => ({
      ...category,
      items: category.items.filter(
        (item) =>
          item.question.toLowerCase().includes(query) ||
          item.answer.toLowerCase().includes(query)
      ),
    })).filter((category) => category.items.length > 0);
  }, [search]);

  // Show filtered or category-selected items
  const displayCategories = useMemo(() => {
    if (search.trim()) return filteredCategories;
    if (activeCategory) {
      return filteredCategories.filter((c) => c.id === activeCategory);
    }
    return filteredCategories;
  }, [filteredCategories, activeCategory, search]);

  function toggleItem(categoryId: string, questionIndex: number) {
    const key = `${categoryId}-${questionIndex}`;
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const totalResults = filteredCategories.reduce(
    (sum, cat) => sum + cat.items.length,
    0
  );

  return (
    <main className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-gray-400 hover:text-white text-sm"
            >
              &larr; Back
            </Link>
            <h1 className="text-xl font-bold text-white">Help & Support</h1>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Hero / Search */}
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            How can we help?
          </h2>
          <p className="text-gray-400 mb-6">
            Search our help articles or browse by category below.
          </p>
          <div className="max-w-xl mx-auto relative">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setActiveCategory(null);
              }}
              placeholder="Search for help articles..."
              className="w-full pl-12 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
          {search && (
            <p className="text-xs text-gray-500 mt-3">
              {totalResults} {totalResults === 1 ? 'result' : 'results'} found
              for &quot;{search}&quot;
            </p>
          )}
        </div>

        {/* Category Chips */}
        {!search && (
          <div className="flex flex-wrap gap-2 mb-8 justify-center">
            <button
              onClick={() => setActiveCategory(null)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeCategory === null
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 border border-gray-700'
              }`}
            >
              All Topics
            </button>
            {FAQ_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() =>
                  setActiveCategory(activeCategory === cat.id ? null : cat.id)
                }
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeCategory === cat.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 border border-gray-700'
                }`}
              >
                <span className="mr-1.5">{cat.icon}</span>
                {cat.title}
              </button>
            ))}
          </div>
        )}

        {/* FAQ Sections */}
        {displayCategories.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 text-lg mb-2">No results found</p>
            <p className="text-gray-500 text-sm">
              Try different keywords or{' '}
              <button
                onClick={() => setSearch('')}
                className="text-blue-400 hover:text-blue-300 underline"
              >
                browse all topics
              </button>
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {displayCategories.map((category) => (
              <section key={category.id}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">{category.icon}</span>
                  <h3 className="text-lg font-semibold text-white">
                    {category.title}
                  </h3>
                  <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
                    {category.items.length}{' '}
                    {category.items.length === 1 ? 'article' : 'articles'}
                  </span>
                </div>
                <div className="space-y-2">
                  {category.items.map((item, index) => (
                    <AccordionItem
                      key={index}
                      item={item}
                      isOpen={openItems.has(`${category.id}-${index}`)}
                      onToggle={() => toggleItem(category.id, index)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Contact Support */}
        <section className="mt-16 text-center">
          <div className="bg-gray-800/50 border border-gray-700/60 rounded-2xl p-8">
            <h3 className="text-xl font-semibold text-white mb-2">
              Still need help?
            </h3>
            <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">
              Can&apos;t find what you&apos;re looking for? Our support team is
              here to help.
            </p>
            <a
              href="mailto:support@admaker.app"
              className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-semibold text-sm rounded-xl transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              Contact Support
            </a>
            <p className="text-xs text-gray-500 mt-3">
              support@admaker.app &middot; We typically respond within 24 hours
            </p>
          </div>
        </section>

        {/* Quick Links Footer */}
        <div className="mt-12 pt-8 border-t border-gray-800/60 flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-gray-500">
          <Link
            href="/privacy"
            className="hover:text-gray-300 transition-colors"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="hover:text-gray-300 transition-colors"
          >
            Terms of Service
          </Link>
          <Link
            href="/billing"
            className="hover:text-gray-300 transition-colors"
          >
            Billing & Plans
          </Link>
          <Link
            href="/welcome"
            className="hover:text-gray-300 transition-colors"
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
