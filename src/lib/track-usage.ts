import { prisma } from '@/lib/prisma';
import { calculateAnthropicCostPence, calculateVeoCostPence } from '@/lib/pricing';
import { checkTokenAlerts } from '@/lib/spend-alerts';

/**
 * Track Anthropic Claude API usage. Fire-and-forget — never throws.
 * Ad generation is free (0 tokens) so this only tracks internal cost.
 */
export async function trackAnthropicUsage(params: {
  companyId: string;
  userId: string;
  projectId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  endpoint: string;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
}): Promise<number> {
  try {
    const costCents = calculateAnthropicCostPence(
      params.model,
      params.inputTokens,
      params.outputTokens
    );

    await prisma.apiUsageLog.create({
      data: {
        companyId: params.companyId,
        userId: params.userId,
        projectId: params.projectId,
        service: 'ANTHROPIC',
        endpoint: params.endpoint,
        model: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        costCents,
        tokensCost: 0, // Ad generation is free
        durationMs: params.durationMs,
        success: params.success,
        errorMessage: params.errorMessage,
      },
    });

    return costCents;
  } catch (err) {
    console.error('Failed to track Anthropic usage:', err);
    return 0;
  }
}

/**
 * Track Google Veo API usage. Fire-and-forget — never throws.
 * Token deduction happens separately in the route (before the API call).
 */
export async function trackVeoUsage(params: {
  companyId: string;
  userId: string;
  projectId?: string;
  model: string;
  videoCount: number;
  videoSeconds?: number;
  endpoint: string;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  tokensCost?: number;
}): Promise<number> {
  try {
    const costCents = calculateVeoCostPence(params.model, params.videoCount);

    await prisma.apiUsageLog.create({
      data: {
        companyId: params.companyId,
        userId: params.userId,
        projectId: params.projectId,
        service: 'GOOGLE_VEO',
        endpoint: params.endpoint,
        model: params.model,
        videoCount: params.videoCount,
        videoSeconds: params.videoSeconds,
        costCents,
        tokensCost: params.tokensCost ?? 0,
        durationMs: params.durationMs,
        success: params.success,
        errorMessage: params.errorMessage,
      },
    });

    // Check token alerts after usage
    checkTokenAlerts(params.companyId);

    return costCents;
  } catch (err) {
    console.error('Failed to track Veo usage:', err);
    return 0;
  }
}