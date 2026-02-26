import { prisma } from '@/lib/prisma';
import { formatTokens } from '@/lib/token-pricing';

/**
 * In-memory set tracking which threshold alerts have already been sent
 * this month. Keyed by "companyId:YYYY-MM:threshold".
 */
const notifiedThresholds = new Set<string>();

/** Thresholds (as percentages) at which we fire alerts. */
const ALERT_THRESHOLDS = [50, 80, 100] as const;

/**
 * Check whether a company's token usage has crossed any alert thresholds
 * and fire a webhook if so. Fire-and-forget — never throws.
 */
export async function checkTokenAlerts(companyId: string): Promise<void> {
  try {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { monthlyTokenBudget: true, name: true },
    });

    if (!company || !company.monthlyTokenBudget || company.monthlyTokenBudget <= 0) {
      return; // No budget set
    }

    const budget = company.monthlyTokenBudget;
    const companyName = company.name || companyId;

    // Get current month's total token usage
    const result = await prisma.tokenTransaction.aggregate({
      where: {
        companyId,
        type: 'DEBIT',
        createdAt: { gte: startOfMonth },
      },
      _sum: { amount: true },
    });

    const used = result._sum.amount || 0;
    const usagePct = (used / budget) * 100;

    for (const threshold of ALERT_THRESHOLDS) {
      if (usagePct < threshold) continue;

      const key = `${companyId}:${monthKey}:${threshold}`;
      if (notifiedThresholds.has(key)) continue;

      notifiedThresholds.add(key);

      const message =
        threshold >= 100
          ? `${companyName} has exceeded their monthly token budget (${formatTokens(used)} of ${formatTokens(budget)} used).`
          : `${companyName} has used ${threshold}% of their monthly token budget (${formatTokens(used)} of ${formatTokens(budget)}).`;

      const payload = {
        companyId,
        companyName,
        threshold,
        tokensUsed: used,
        tokenBudget: budget,
        message,
      };

      const webhookUrl = process.env.SPEND_ALERT_WEBHOOK_URL;

      if (!webhookUrl) {
        console.log(`[Token Alert] ${message}`, payload);
        continue;
      }

      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (webhookErr) {
        console.error(`[Token Alert] Failed to send webhook for ${threshold}%:`, webhookErr);
      }
    }
  } catch (err) {
    console.error('[Token Alert] Failed to check alerts:', err);
  }
}
