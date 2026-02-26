/**
 * Stripe client singleton — lazy-initialized on first access.
 * Same pattern as prisma.ts: only creates the client when a property is accessed.
 */

import Stripe from 'stripe';

const globalForStripe = globalThis as unknown as { stripe: Stripe | undefined };

function createStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not set');
  }
  return new Stripe(key);
}

// Lazy initialization — only connect when first accessed
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    if (!globalForStripe.stripe) {
      globalForStripe.stripe = createStripeClient();
    }
    const value = (globalForStripe.stripe as any)[prop];
    if (typeof value === 'function') {
      return value.bind(globalForStripe.stripe);
    }
    return value;
  },
});
