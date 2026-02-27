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
    // Gemini 2.5 Pro — ~£1.00/1M input, ~£4.00/1M output (approx USD converted)
    'gemini-2.5-pro': { inputPerMillion: 100, outputPerMillion: 400 },
    // Fallback for unknown models
    default: { inputPerMillion: 240, outputPerMillion: 1200 },
  },
  googleVeo: {
    // Legacy Veo 2 (kept for historical data)
    'veo-2.0-generate-001': { perVideoPence: 28 },
    // kie.ai Veo 3.1 Fast — $0.40/video (~£0.32)
    'veo3_fast': { perVideoPence: 32 },
    // kie.ai Veo 3.1 Quality — $2.00/video (~£1.60)
    'veo3': { perVideoPence: 160 },
    // kie.ai Kling 2.6 — $0.55/video (~£0.44)
    'kling-2.6/text-to-video': { perVideoPence: 44 },
    // kie.ai Sora 2 — $0.15/video (~£0.12)
    'sora-2-text-to-video': { perVideoPence: 12 },
    // kie.ai Sora 2 Pro — $0.40/video (~£0.32)
    'sora-2-pro-text-to-video': { perVideoPence: 32 },
    // kie.ai Seedance 1.5 Pro — $0.14/video (~£0.11)
    'bytedance/seedance-1.5-pro': { perVideoPence: 11 },
    // Fallback
    default: { perVideoPence: 32 },
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
