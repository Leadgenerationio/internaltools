/**
 * Plan tier definitions and limits.
 * All monetary values in pence (£).
 *
 * Token model:
 *   1 token  = 1 finished ad video (user uploads own background video)
 *   10 tokens = 1 AI-generated video + all renders onto it (bundled)
 *
 * Ad copy generation and regeneration are FREE (included in all plans).
 */

export const PLAN_LIMITS = {
  FREE: {
    label: 'Free',
    priceMonthlyPence: 0,
    monthlyTokens: 40,
    topupEnabled: false, // Must upgrade to buy top-ups
    topupPricePerTokenPence: 0,
    maxUsers: 1,
    maxStorageBytes: 5 * 1024 * 1024 * 1024, // 5GB
  },
  STARTER: {
    label: 'Starter',
    priceMonthlyPence: 2900, // £29
    monthlyTokens: 500,
    topupEnabled: true,
    topupPricePerTokenPence: 10, // 10p per token
    maxUsers: 5,
    maxStorageBytes: 50 * 1024 * 1024 * 1024, // 50GB
  },
  PRO: {
    label: 'Pro',
    priceMonthlyPence: 9900, // £99
    monthlyTokens: 2500,
    topupEnabled: true,
    topupPricePerTokenPence: 8, // 8p per token
    maxUsers: Infinity,
    maxStorageBytes: 500 * 1024 * 1024 * 1024, // 500GB
  },
  ENTERPRISE: {
    label: 'Enterprise',
    priceMonthlyPence: 0, // Custom pricing
    monthlyTokens: 0, // Set per company
    topupEnabled: true,
    topupPricePerTokenPence: 0, // Custom
    maxUsers: Infinity,
    maxStorageBytes: Infinity,
  },
} as const;

export type PlanKey = keyof typeof PLAN_LIMITS;

export function getPlanLimits(plan: string) {
  return PLAN_LIMITS[plan as PlanKey] || PLAN_LIMITS.FREE;
}

/**
 * Top-up packages available for purchase.
 * Prices adjust per plan tier (higher plans get cheaper tokens).
 */
export const TOPUP_PACKAGES = [
  { id: 'small', label: 'Small', tokens: 50 },
  { id: 'medium', label: 'Medium', tokens: 150 },
  { id: 'large', label: 'Large', tokens: 500 },
] as const;

/**
 * Get top-up packages with plan-specific pricing.
 */
export function getTopupPackages(plan: string) {
  const limits = getPlanLimits(plan);
  if (!limits.topupEnabled) return [];

  return TOPUP_PACKAGES.map((pkg) => ({
    ...pkg,
    pricePence: pkg.tokens * limits.topupPricePerTokenPence,
  }));
}
