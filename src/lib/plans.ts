/**
 * Plan tier definitions and limits.
 * All monetary values in pence (£).
 */

export const PLAN_LIMITS = {
  FREE: {
    label: 'Free',
    priceMonthlyPence: 0,
    maxGenerationsPerMonth: 10,
    maxUsers: 1,
    maxStorageBytes: 5 * 1024 * 1024 * 1024, // 5GB
  },
  STARTER: {
    label: 'Starter',
    priceMonthlyPence: 2900, // £29
    maxGenerationsPerMonth: 100,
    maxUsers: 5,
    maxStorageBytes: 50 * 1024 * 1024 * 1024, // 50GB
  },
  PRO: {
    label: 'Pro',
    priceMonthlyPence: 9900, // £99
    maxGenerationsPerMonth: Infinity,
    maxUsers: Infinity,
    maxStorageBytes: 500 * 1024 * 1024 * 1024, // 500GB
  },
  ENTERPRISE: {
    label: 'Enterprise',
    priceMonthlyPence: 0, // Custom pricing
    maxGenerationsPerMonth: Infinity,
    maxUsers: Infinity,
    maxStorageBytes: Infinity,
  },
} as const;

export type PlanKey = keyof typeof PLAN_LIMITS;

export function getPlanLimits(plan: string) {
  return PLAN_LIMITS[plan as PlanKey] || PLAN_LIMITS.FREE;
}
