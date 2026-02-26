import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { creditTokens } from '@/lib/token-balance';
import { getPlanLimits, type PlanKey } from '@/lib/plans';
import { sendSubscriptionRenewalEmail } from '@/lib/email';
import { createCompanyNotification } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

// Map Stripe price IDs back to plan keys
function getPlanFromPriceId(priceId: string): PlanKey | null {
  if (priceId === process.env.STRIPE_PRICE_STARTER) return 'STARTER';
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'PRO';
  return null;
}

/**
 * Handle checkout.session.completed — new subscription or one-time top-up purchase.
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const metadata = session.metadata || {};
  const { companyId, type } = metadata;

  if (!companyId) {
    console.error('Stripe webhook: checkout.session.completed missing companyId in metadata');
    return;
  }

  if (type === 'subscription') {
    // ─── New subscription ────────────────────────────────
    const plan = metadata.plan as PlanKey;
    if (!plan || !['STARTER', 'PRO'].includes(plan)) {
      console.error('Stripe webhook: invalid plan in metadata:', plan);
      return;
    }

    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;

    if (!subscriptionId) {
      console.error('Stripe webhook: no subscription ID in checkout session');
      return;
    }

    const planLimits = getPlanLimits(plan);

    // Update company with new plan and subscription ID
    await prisma.company.update({
      where: { id: companyId },
      data: {
        plan,
        stripeSubscriptionId: subscriptionId,
      },
    });

    // Credit monthly tokens for the new plan
    await creditTokens({
      companyId,
      amount: planLimits.monthlyTokens,
      reason: 'PLAN_ALLOCATION',
      description: `${planLimits.label} plan activated — ${planLimits.monthlyTokens} monthly tokens`,
      stripePaymentId: session.payment_intent as string || undefined,
    });

    console.log(`Stripe: Company ${companyId} upgraded to ${plan}, credited ${planLimits.monthlyTokens} tokens`);
  } else if (type === 'topup') {
    // ─── One-time top-up purchase ────────────────────────
    const { topupId, tokens, pricePence } = metadata;
    const tokenAmount = parseInt(tokens, 10);

    if (!topupId || !tokenAmount || isNaN(tokenAmount)) {
      console.error('Stripe webhook: invalid top-up metadata:', metadata);
      return;
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || null;

    // Update the TokenTopup record
    await prisma.tokenTopup.update({
      where: { id: topupId },
      data: {
        status: 'COMPLETED',
        stripePaymentId: paymentIntentId,
        completedAt: new Date(),
      },
    });

    // Credit the tokens
    await creditTokens({
      companyId,
      amount: tokenAmount,
      reason: 'TOPUP_PURCHASE',
      description: `Top-up: ${tokenAmount} tokens purchased`,
      userId: metadata.userId || undefined,
      stripePaymentId: paymentIntentId || undefined,
    });

    console.log(`Stripe: Company ${companyId} purchased ${tokenAmount} token top-up`);
  }
}

/**
 * Handle invoice.payment_succeeded — monthly renewal credits tokens.
 */
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  // Only process subscription renewals, not the first invoice (handled by checkout.session.completed)
  if (invoice.billing_reason === 'subscription_create') {
    return;
  }

  // Extract subscription ID from the parent field (Stripe API 2026+)
  const parentSub = invoice.parent?.subscription_details;
  const subscriptionId = parentSub
    ? typeof parentSub.subscription === 'string'
      ? parentSub.subscription
      : parentSub.subscription?.id
    : null;

  if (!subscriptionId) return;

  // Find the company by subscription ID
  const company = await prisma.company.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    select: { id: true, plan: true },
  });

  if (!company) {
    console.error('Stripe webhook: no company found for subscription', subscriptionId);
    return;
  }

  const planLimits = getPlanLimits(company.plan);
  if (planLimits.monthlyTokens <= 0) return;

  // Credit monthly token allocation
  await creditTokens({
    companyId: company.id,
    amount: planLimits.monthlyTokens,
    reason: 'PLAN_ALLOCATION',
    description: `Monthly renewal — ${planLimits.label} plan: ${planLimits.monthlyTokens} tokens`,
  });

  // Send renewal email to the company owner (fire-and-forget)
  try {
    const owner = await prisma.user.findFirst({
      where: { companyId: company.id, role: 'OWNER' },
      select: { email: true, name: true },
    });
    if (owner) {
      sendSubscriptionRenewalEmail(
        owner.email,
        owner.name || '',
        planLimits.label,
        planLimits.monthlyTokens
      );
    }
  } catch {
    // Ignore — email is non-critical
  }

  // In-app notification for all company users (fire-and-forget)
  createCompanyNotification(
    company.id,
    'PLAN_CHANGED',
    'Subscription renewed',
    `Your ${planLimits.label} plan has renewed. ${planLimits.monthlyTokens} tokens have been added.`,
    '/billing'
  );

  console.log(`Stripe: Monthly renewal for company ${company.id} (${company.plan}), credited ${planLimits.monthlyTokens} tokens`);
}

/**
 * Handle customer.subscription.updated — plan upgrades/downgrades.
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const companyId = subscription.metadata?.companyId;
  if (!companyId) {
    // Try to find by subscription ID
    const company = await prisma.company.findFirst({
      where: { stripeSubscriptionId: subscription.id },
      select: { id: true },
    });
    if (!company) {
      console.error('Stripe webhook: cannot find company for subscription update', subscription.id);
      return;
    }
    await processSubscriptionUpdate(company.id, subscription);
    return;
  }
  await processSubscriptionUpdate(companyId, subscription);
}

async function processSubscriptionUpdate(companyId: string, subscription: Stripe.Subscription) {
  // Determine the new plan from the subscription's price
  const item = subscription.items?.data?.[0];
  if (!item) return;

  const priceId = typeof item.price === 'string' ? item.price : item.price?.id;
  if (!priceId) return;

  const newPlan = getPlanFromPriceId(priceId);
  if (!newPlan) {
    console.error('Stripe webhook: unknown price ID in subscription update:', priceId);
    return;
  }

  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { plan: true },
  });

  if (company.plan === newPlan) return; // No change

  const oldPlan = company.plan;
  const newLimits = getPlanLimits(newPlan);

  await prisma.company.update({
    where: { id: companyId },
    data: {
      plan: newPlan,
      stripeSubscriptionId: subscription.id,
    },
  });

  // If upgrading, credit the difference in monthly tokens
  const oldLimits = getPlanLimits(oldPlan);
  if (newLimits.monthlyTokens > oldLimits.monthlyTokens) {
    const bonusTokens = newLimits.monthlyTokens - oldLimits.monthlyTokens;
    await creditTokens({
      companyId,
      amount: bonusTokens,
      reason: 'PLAN_ALLOCATION',
      description: `Plan upgrade ${oldPlan} -> ${newPlan}: +${bonusTokens} bonus tokens`,
    });
  }

  console.log(`Stripe: Company ${companyId} plan changed from ${oldPlan} to ${newPlan}`);
}

/**
 * Handle customer.subscription.deleted — cancel/expire subscription.
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  // Find the company by subscription ID
  const company = await prisma.company.findFirst({
    where: { stripeSubscriptionId: subscription.id },
    select: { id: true, plan: true },
  });

  if (!company) {
    console.error('Stripe webhook: no company found for deleted subscription', subscription.id);
    return;
  }

  // Downgrade to FREE
  await prisma.company.update({
    where: { id: company.id },
    data: {
      plan: 'FREE',
      stripeSubscriptionId: null,
    },
  });

  // Credit the FREE plan tokens
  const freeLimits = getPlanLimits('FREE');
  await creditTokens({
    companyId: company.id,
    amount: freeLimits.monthlyTokens,
    reason: 'PLAN_ALLOCATION',
    description: `Subscription cancelled — downgraded to Free plan (${freeLimits.monthlyTokens} tokens)`,
  });

  console.log(`Stripe: Company ${company.id} subscription cancelled, downgraded to FREE`);
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('Stripe webhook: STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  let event: Stripe.Event;

  try {
    // Read raw body for signature verification
    const rawBody = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }

    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      default:
        // Unhandled event type — acknowledge receipt
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error(`Stripe webhook error handling ${event.type}:`, error);
    // Return 200 even on processing errors to prevent Stripe from retrying indefinitely.
    // The error is logged for investigation.
    return NextResponse.json({ received: true, error: 'Processing error logged' });
  }
}
