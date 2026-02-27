/**
 * Token costs per operation.
 *
 * 1 token = 1 finished ad video (own uploaded video)
 * 10 tokens = 1 AI-generated video + all renders onto it (bundled)
 *
 * Ad generation and rendering are included in the token cost —
 * users never get stuck with ads they can't render.
 */

import { VIDEO_MODELS } from '@/lib/types';

export const TOKEN_COSTS = {
  /** Full ad set generation (10 ads) — included free, costs 0 tokens */
  GENERATE_ADS: 0,
  /** Regenerate a single ad — included free, costs 0 tokens */
  REGENERATE_AD: 0,
  /** Render 1 finished ad video (user's own background video) */
  RENDER_VIDEO: 1,
  /** Default fallback for AI video — used when model lookup fails */
  GENERATE_VIDEO: 5,
} as const;

export type TokenOperation = keyof typeof TOKEN_COSTS;

/**
 * Calculate total token cost for a render batch.
 * Each output video (approved ad × background video) costs 1 token.
 */
export function calculateRenderTokens(outputCount: number): number {
  return outputCount * TOKEN_COSTS.RENDER_VIDEO;
}

/**
 * Calculate total token cost for AI video generation.
 * Token cost varies by model — each model is priced to cover API cost + margin.
 */
export function calculateVeoTokens(videoCount: number, modelId?: string): number {
  if (modelId) {
    const model = VIDEO_MODELS.find((m) => m.id === modelId);
    if (model) return videoCount * model.tokenCost;
  }
  return videoCount * TOKEN_COSTS.GENERATE_VIDEO;
}

/**
 * Format a token count for display.
 */
export function formatTokens(count: number): string {
  if (count === 1) return '1 token';
  return `${count.toLocaleString()} tokens`;
}
