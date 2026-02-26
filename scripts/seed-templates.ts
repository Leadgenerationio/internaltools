import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new (PrismaClient as any)({ adapter });

const SYSTEM_TEMPLATES = [
  {
    name: 'E-commerce Product Launch',
    description:
      'Launch a new physical product with urgency-driven ads across all funnel stages. Great for DTC brands, Amazon sellers, and Shopify stores.',
    category: 'E-commerce',
    brief: {
      productService:
        'A new wireless noise-cancelling earbuds product launching on our DTC website. Premium build quality, 36-hour battery life, active noise cancellation with transparency mode.',
      targetAudience:
        'Tech-savvy adults aged 22-40 who commute daily, work out regularly, or work from home. They value quality audio and are willing to pay a premium over cheap alternatives.',
      sellingPoints:
        '36-hour battery life (longest in class), hybrid active noise cancellation, IP55 water/sweat resistant, 6 ear tip sizes for perfect fit, 30-day money-back guarantee, free next-day shipping on launch orders.',
      adExamples:
        'Hook: "Your AirPods are about to collect dust." Body: social proof (10,000 pre-orders), feature highlight, urgency CTA. Style: punchy, benefit-led, conversational.',
      toneStyle:
        'Confident and conversational. Not salesy or corporate. Think "cool friend recommending something great" rather than infomercial.',
      additionalContext:
        'Launch price is 30% off RRP for the first 500 orders. Include a sense of scarcity. Avoid comparing directly to Apple by name. Focus on what makes us different, not what makes them bad.',
      addEmojis: true,
    },
  },
  {
    name: 'SaaS Free Trial',
    description:
      'Drive free trial signups for a B2B SaaS product. Focuses on pain points, ROI, and reducing friction to sign up.',
    category: 'SaaS',
    brief: {
      productService:
        'A project management tool for small agencies (5-50 people) that combines task tracking, time logging, client portals, and automated invoicing in one platform. 14-day free trial, no credit card required.',
      targetAudience:
        'Agency owners and operations managers at creative, marketing, or development agencies with 5-50 staff. Frustrated with using 4-5 different tools (Asana + Toggl + Harvest + spreadsheets) and losing time to context-switching.',
      sellingPoints:
        'Replace 4+ tools with one platform. Clients can see project progress in real-time. Automatic time tracking reduces admin by 8 hours/week. Invoices generated from tracked time in one click. 14-day free trial, no credit card.',
      adExamples:
        '"Still using spreadsheets to track your agency projects?" followed by pain points, then a feature walkthrough, ending with "Start your free trial in 60 seconds." Clean, minimal design.',
      toneStyle:
        'Professional but approachable. Empathetic to the pain of juggling tools. Data-driven where possible (hours saved, revenue recovered).',
      additionalContext:
        'We just launched a Slack integration and Zapier connector. The free trial converts best when people actually invite their team, so encourage that action. No long-term contracts.',
      addEmojis: false,
    },
  },
  {
    name: 'Local Business',
    description:
      'Promote a local service business to nearby customers. Ideal for plumbers, cleaners, gyms, salons, and restaurants.',
    category: 'Local Business',
    brief: {
      productService:
        'A family-run carpet and upholstery cleaning service covering a 25-mile radius. Same-day availability, eco-friendly products safe for children and pets, serving residential and small commercial properties.',
      targetAudience:
        'Homeowners aged 30-60 in suburban areas who care about keeping their homes clean, especially those with children, pets, or allergies. Also landlords preparing properties between tenants.',
      sellingPoints:
        'Same-day service available, fully insured and DBS-checked team, eco-friendly non-toxic products, free stain treatment on all bookings this month, 5-star rating on Google with 200+ reviews, before/after photos on every job.',
      adExamples:
        'Before/after carpet shots with captions like "This is what 3 years of foot traffic looks like" and "We fixed it in 45 minutes." Social proof with review screenshots. Strong local angle.',
      toneStyle:
        'Friendly, trustworthy, and local. Use "we" and "your" — feel like a neighbour recommending a great service. Avoid corporate jargon.',
      additionalContext:
        'Currently running a spring cleaning promotion: book 3 rooms, get the 4th free. Mention this offer in BOFU ads. We cover [City] and surrounding areas within 25 miles.',
      addEmojis: true,
    },
  },
  {
    name: 'Event Promotion',
    description:
      'Promote an upcoming event, webinar, or conference. Builds awareness, highlights speakers/content, and drives registrations.',
    category: 'Events',
    brief: {
      productService:
        'A 2-day virtual marketing summit for ecommerce brands. 20+ expert speakers including founders of 8-figure brands. Topics: paid ads strategy, email marketing, conversion rate optimisation, and scaling operations. Early bird tickets available.',
      targetAudience:
        'Ecommerce brand founders and marketing managers running stores doing between 50K-5M annually. They want actionable strategies, not generic advice. Primarily in the UK, US, and Australia.',
      sellingPoints:
        'Learn from founders who have built 8-figure brands. 20+ sessions over 2 days. Lifetime access to all recordings. Private community access post-event. Early bird pricing: save 40% until tickets sell out. Networking sessions with speakers.',
      adExamples:
        'Speaker announcement posts with credentials. "What I would do differently if I started my ecom brand today" angle. Countdown timers for early bird pricing. Testimonials from last year\'s attendees.',
      toneStyle:
        'Exciting and high-energy but professional. Create FOMO without being pushy. Let the speaker credentials and past attendee results do the heavy lifting.',
      additionalContext:
        'The event is in 6 weeks. Early bird pricing ends in 2 weeks. Last year we had 3,000 attendees and 94% satisfaction rating. Use these numbers. Avoid using "webinar" — call it a "summit" or "conference".',
      addEmojis: true,
    },
  },
  {
    name: 'App Download',
    description:
      'Drive mobile app installs with feature-focused ads. Works for fitness apps, productivity tools, games, and utilities.',
    category: 'Mobile Apps',
    brief: {
      productService:
        'A personal finance app that automatically categorises bank transactions, creates visual spending breakdowns, sets budget goals, and sends weekly spending reports. Available on iOS and Android. Free with optional premium tier.',
      targetAudience:
        'Young professionals aged 22-35 who earn a decent salary but feel like their money disappears each month. Not finance experts — they want simple, visual tools, not spreadsheets. Comfortable with mobile apps.',
      sellingPoints:
        'Connects to all major UK banks in 2 taps. Auto-categorises every transaction. Beautiful weekly spending reports. Set budget goals and get alerts before you overspend. Free to use — premium unlocks advanced insights. 250K+ downloads, 4.8 star rating.',
      adExamples:
        '"Where does your money actually go?" followed by a screen recording of the app categorising a month of spending into beautiful charts. End with "Download free — takes 30 seconds." Short, visual, mobile-first.',
      toneStyle:
        'Friendly, relatable, slightly cheeky. Talk about money anxiety in a way that feels like a friend helping, not a bank lecturing. Use real-world scenarios (that Deliveroo habit, the subscription you forgot about).',
      additionalContext:
        'The app just won "Best Finance App" at the UK App Awards. Mention this. Our best converting ads show the app in use (screen recordings or mockups). Avoid financial jargon — keep it simple.',
      addEmojis: true,
    },
  },
  {
    name: 'Real Estate Listing',
    description:
      'Market a property listing or real estate service. Highlights property features, location benefits, and urgency to enquire.',
    category: 'Real Estate',
    brief: {
      productService:
        'A modern 3-bedroom detached house in a sought-after suburban development. Open-plan kitchen/living, south-facing garden, home office, double garage, walking distance to top-rated schools and a train station with 35-minute commute to the city centre.',
      targetAudience:
        'Professional couples and young families aged 28-45 looking to upsize from a flat or smaller house. Currently renting or in a starter home. Commute to the city for work but want suburban quality of life for their children.',
      sellingPoints:
        'Brand new build with 10-year warranty. South-facing garden perfect for families. Dedicated home office space (the new essential). EPC rating A — low energy bills. Help to Buy available. Only 6 plots remaining in this phase.',
      adExamples:
        'Lifestyle-focused: "Imagine Sunday mornings in your own south-facing garden" with aspirational property photography. Feature callouts: "3 beds, home office, double garage." Urgency: "Only 6 plots left in Phase 2."',
      toneStyle:
        'Aspirational and warm. Paint a picture of the lifestyle, not just the property specs. Professional but not cold. Create a sense of exclusive opportunity.',
      additionalContext:
        'Virtual tours available — drive people to book a viewing or virtual tour. Prices start from the amount shown on the listing page. Mention the nearby schools and train station explicitly as these are the biggest selling points for our target audience.',
      addEmojis: false,
    },
  },
];

async function main() {
  // Check if system templates already exist
  const existingCount = await prisma.projectTemplate.count({
    where: { isSystem: true },
  });

  if (existingCount > 0) {
    console.log(
      `${existingCount} system templates already exist. Skipping seed.`
    );
    console.log(
      'To re-seed, delete existing system templates first: DELETE FROM "ProjectTemplate" WHERE "isSystem" = true;'
    );
    return;
  }

  console.log(`Seeding ${SYSTEM_TEMPLATES.length} system templates...`);

  for (const tmpl of SYSTEM_TEMPLATES) {
    const template = await prisma.projectTemplate.create({
      data: {
        name: tmpl.name,
        description: tmpl.description,
        category: tmpl.category,
        brief: tmpl.brief,
        isSystem: true,
        companyId: null,
        userId: null,
      },
    });
    console.log(`  Created: "${template.name}" (${template.id})`);
  }

  console.log(`Done! ${SYSTEM_TEMPLATES.length} system templates created.`);
}

main()
  .catch((e) => {
    console.error('Seed templates failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
