/**
 * API pricing constants and cost calculation.
 * All costs stored in pence (integer) to avoid floating-point rounding.
 * Displayed as £ in the UI.
 * Update when provider pricing changes.
 */

// Currency symbol used across the app
export const CURRENCY_SYMBOL = '£';

export const PRICING = {
  anthropic: {
    // Claude Sonnet 4 — £2.40/1M input, £12/1M output (approx USD converted)
    'claude-sonnet-4-20250514': { inputPerMillion: 240, outputPerMillion: 1200 },
    // Fallback for unknown models
    default: { inputPerMillion: 240, outputPerMillion: 1200 },
  },
  googleVeo: {
    // Veo 2 — ~£0.28 per 5s clip (approx USD converted)
    'veo-2.0-generate-001': { perVideoPence: 28 },
    // Fallback
    default: { perVideoPence: 28 },
  },
} as const;

/**
 * Calculate Anthropic API cost in pence.
 */
export function calculateAnthropicCostPence(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing =
    PRICING.anthropic[model as keyof typeof PRICING.anthropic] ||
    PRICING.anthropic.default;
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
  return Math.ceil(inputCost + outputCost);
}

/**
 * Calculate Veo API cost in pence.
 */
export function calculateVeoCostPence(
  model: string,
  videoCount: number
): number {
  const pricing =
    PRICING.googleVeo[model as keyof typeof PRICING.googleVeo] ||
    PRICING.googleVeo.default;
  return Math.ceil(videoCount * pricing.perVideoPence);
}

/**
 * Format pence as pounds string (e.g. 150 → "£1.50")
 */
export function formatPence(pence: number): string {
  return `${CURRENCY_SYMBOL}${(pence / 100).toFixed(2)}`;
}
