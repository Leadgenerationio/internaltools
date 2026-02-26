import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-auth';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { getTopupPackages } from '@/lib/plans';

const VALID_PLANS = ['STARTER', 'PRO'] as const;
const VALID_TOPUPS = ['small', 'medium', 'large'] as const;

type SubscriptionPlan = (typeof VALID_PLANS)[number];
type TopupId = (typeof VALID_TOPUPS)[number];

/** Map plan keys to their Stripe Price ID env vars */
const PLAN_PRICE_ENV: Record<SubscriptionPlan, string> = {
  STARTER: 'STRIPE_PRICE_STARTER',
  PRO: 'STRIPE_PRICE_PRO',
};

/**
 * Get or create a Stripe Customer for the company.
 * Stores the stripeCustomerId on the company record for reuse.
 */
async function getOrCreateStripeCustomer(companyId: string, email: string): Promise<string> {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { stripeCustomerId: true, name: true },
  });

  if (company.stripeCustomerId) {
    return company.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email,
    metadata: { companyId },
    name: company.name,
  });

  await prisma.company.update({
    where: { id: companyId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

export async function POST(request: NextRequest) {
  const authResult = await getAuthContext();
  if (authResult.error) return authResult.error;
  const { companyId, userId, email } = authResult.auth;

  try {
    // Validate payload size
    const rawBody = await request.text();
    if (rawBody.length > 10_000) {
      return NextResponse.json({ error: 'Request payload too large' }, { status: 413 });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { plan, topupPackageId } = body as {
      plan?: string;
      topupPackageId?: string;
    };

    // Must specify exactly one of plan or topupPackageId
    if ((!plan && !topupPackageId) || (plan && topupPackageId)) {
      return NextResponse.json(
        { error: 'Specify either "plan" for subscription or "topupPackageId" for top-up' },
        { status: 400 }
      );
    }

    const customerId = await getOrCreateStripeCustomer(companyId, email);
    const origin = request.headers.get('origin') || process.env.NEXTAUTH_URL || 'http://localhost:3000';

    // ─── Subscription checkout ───────────────────────────────
    if (plan) {
      if (!VALID_PLANS.includes(plan as SubscriptionPlan)) {
        return NextResponse.json(
          { error: `Invalid plan. Must be one of: ${VALID_PLANS.join(', ')}` },
          { status: 400 }
        );
      }

      const envKey = PLAN_PRICE_ENV[plan as SubscriptionPlan];
      const priceId = process.env[envKey];
      if (!priceId) {
        return NextResponse.json(
          { error: `Stripe price not configured for ${plan} plan. Set ${envKey} env var.` },
          { status: 500 }
        );
      }

      // Check if they already have an active subscription
      const company = await prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { stripeSubscriptionId: true, plan: true },
      });

      if (company.stripeSubscriptionId && company.plan !== 'FREE') {
        return NextResponse.json(
          { error: 'You already have an active subscription. Use the Manage Subscription button to change or cancel your plan.' },
          { status: 400 }
        );
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/billing?checkout=success&plan=${plan}`,
        cancel_url: `${origin}/billing?checkout=cancelled`,
        metadata: {
          companyId,
          userId,
          plan,
          type: 'subscription',
        },
        subscription_data: {
          metadata: {
            companyId,
            userId,
            plan,
          },
        },
      });

      return NextResponse.json({ url: session.url });
    }

    // ─── Top-up checkout ─────────────────────────────────────
    if (topupPackageId) {
      if (!VALID_TOPUPS.includes(topupPackageId as TopupId)) {
        return NextResponse.json(
          { error: `Invalid top-up package. Must be one of: ${VALID_TOPUPS.join(', ')}` },
          { status: 400 }
        );
      }

      // Get the company's current plan to calculate top-up price
      const company = await prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { plan: true },
      });

      const packages = getTopupPackages(company.plan);
      if (packages.length === 0) {
        return NextResponse.json(
          { error: 'Token top-ups are not available on the Free plan. Please upgrade first.' },
          { status: 400 }
        );
      }

      const pkg = packages.find((p) => p.id === topupPackageId);
      if (!pkg) {
        return NextResponse.json({ error: 'Top-up package not found' }, { status: 400 });
      }

      // Create a pending TokenTopup record
      const topup = await prisma.tokenTopup.create({
        data: {
          companyId,
          userId,
          tokenAmount: pkg.tokens,
          pricePence: pkg.pricePence,
          status: 'PENDING',
        },
      });

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: 'gbp',
              unit_amount: pkg.pricePence,
              product_data: {
                name: `${pkg.label} Token Top-Up (${pkg.tokens} tokens)`,
                description: `Add ${pkg.tokens} tokens to your account`,
              },
            },
            quantity: 1,
          },
        ],
        success_url: `${origin}/billing?checkout=success&topup=${topupPackageId}`,
        cancel_url: `${origin}/billing?checkout=cancelled`,
        metadata: {
          companyId,
          userId,
          type: 'topup',
          topupId: topup.id,
          topupPackageId,
          tokens: String(pkg.tokens),
          pricePence: String(pkg.pricePence),
        },
      });

      // Store the Stripe session ID on the topup record
      await prisma.tokenTopup.update({
        where: { id: topup.id },
        data: { stripeSessionId: session.id },
      });

      return NextResponse.json({ url: session.url });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (error: any) {
    console.error('Create checkout error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
