import { prisma } from '@/lib/prisma';

/**
 * In-memory set tracking which threshold alerts have already been sent
 * this month. Keyed by "companyId:YYYY-MM:threshold".
 * Resets naturally when the month changes (new keys).
 */
const notifiedThresholds = new Set<string>();

/** Thresholds (as percentages) at which we fire alerts. */
const ALERT_THRESHOLDS = [50, 80, 100] as const;

/**
 * Check whether a company's spend has crossed any alert thresholds
 * and fire a webhook if so. Fire-and-forget — never throws.
 */
export async function checkSpendAlerts(companyId: string): Promise<void> {
  try {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get the company's budget
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { monthlyBudgetCents: true, name: true },
    });

    if (!company || !company.monthlyBudgetCents || company.monthlyBudgetCents <= 0) {
      return; // No budget set — nothing to check
    }

    const budgetPence: number = company.monthlyBudgetCents;
    const companyName: string = company.name || companyId;

    // Get current month's total spend
    const result = await prisma.apiUsageLog.aggregate({
      where: {
        companyId,
        createdAt: { gte: startOfMonth },
        success: true,
      },
      _sum: { costCents: true },
    });

    const currentSpendPence: number = result._sum.costCents || 0;
    const spendPercentage = (currentSpendPence / budgetPence) * 100;

    // Check each threshold from highest to lowest
    for (const threshold of ALERT_THRESHOLDS) {
      if (spendPercentage < threshold) {
        continue;
      }

      const notificationKey = `${companyId}:${monthKey}:${threshold}`;
      if (notifiedThresholds.has(notificationKey)) {
        continue; // Already notified for this threshold this month
      }

      // Mark as notified before sending (prevents duplicate sends on race)
      notifiedThresholds.add(notificationKey);

      const message =
        threshold >= 100
          ? `${companyName} has exceeded their monthly budget (${spendPercentage.toFixed(1)}% used).`
          : `${companyName} has used ${threshold}% of their monthly budget (${spendPercentage.toFixed(1)}% actual).`;

      const payload = {
        companyId,
        companyName,
        threshold,
        currentSpendPence,
        budgetPence,
        message,
      };

      const webhookUrl = process.env.SPEND_ALERT_WEBHOOK_URL;

      if (!webhookUrl) {
        console.log(`[Spend Alert] ${message}`, payload);
        continue;
      }

      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (webhookErr) {
        console.error(`[Spend Alert] Failed to send webhook for threshold ${threshold}%:`, webhookErr);
        // Don't remove from notifiedThresholds — avoid spamming a broken webhook
      }
    }
  } catch (err) {
    console.error('[Spend Alert] Failed to check spend alerts:', err);
  }
}
