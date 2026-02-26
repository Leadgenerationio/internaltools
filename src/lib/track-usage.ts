import { prisma } from '@/lib/prisma';
import { calculateAnthropicCostPence, calculateVeoCostPence } from '@/lib/pricing';
import { checkSpendAlerts } from '@/lib/spend-alerts';

/**
 * Track Anthropic Claude API usage. Fire-and-forget — never throws.
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
        durationMs: params.durationMs,
        success: params.success,
        errorMessage: params.errorMessage,
      },
    });

    // Fire-and-forget spend alert check (don't await)
    checkSpendAlerts(params.companyId);

    return costCents;
  } catch (err) {
    console.error('Failed to track Anthropic usage:', err);
    return 0;
  }
}

/**
 * Track Google Veo API usage. Fire-and-forget — never throws.
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
        durationMs: params.durationMs,
        success: params.success,
        errorMessage: params.errorMessage,
      },
    });

    // Fire-and-forget spend alert check (don't await)
    checkSpendAlerts(params.companyId);

    return costCents;
  } catch (err) {
    console.error('Failed to track Veo usage:', err);
    return 0;
  }
}

/**
 * Get a company's total spend for the current month (in cents).
 */
export async function getMonthlySpendCents(companyId: string): Promise<number> {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const result = await prisma.apiUsageLog.aggregate({
      where: {
        companyId,
        createdAt: { gte: startOfMonth },
        success: true,
      },
      _sum: { costCents: true },
    });

    return result._sum.costCents || 0;
  } catch (err) {
    console.error('Failed to get monthly spend:', err);
    return 0;
  }
}
