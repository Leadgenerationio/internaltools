/**
 * API pricing constants and cost calculation.
 * Costs stored in cents (integer) to avoid floating-point rounding.
 * Update when provider pricing changes.
 */

export const PRICING = {
  anthropic: {
    // Claude Sonnet 4 — $3/1M input, $15/1M output
    'claude-sonnet-4-20250514': { inputPerMillion: 300, outputPerMillion: 1500 },
    // Fallback for unknown models
    default: { inputPerMillion: 300, outputPerMillion: 1500 },
  },
  googleVeo: {
    // Veo 2 — ~$0.35 per 5s clip
    'veo-2.0-generate-001': { perVideoCents: 35 },
    // Fallback
    default: { perVideoCents: 35 },
  },
} as const;

export function calculateAnthropicCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing =
    PRICING.anthropic[model as keyof typeof PRICING.anthropic] ||
    PRICING.anthropic.default;
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
  return Math.ceil((inputCost + outputCost) * 100); // dollars to cents
}

export function calculateVeoCostCents(
  model: string,
  videoCount: number
): number {
  const pricing =
    PRICING.googleVeo[model as keyof typeof PRICING.googleVeo] ||
    PRICING.googleVeo.default;
  return Math.ceil(videoCount * pricing.perVideoCents);
}
