import { prisma } from '@/lib/prisma';
import { formatTokens } from '@/lib/token-pricing';
import { sendTokenBudgetAlert } from '@/lib/email';

/** Thresholds (as percentages) at which we fire alerts. */
const ALERT_THRESHOLDS = [50, 80, 100] as const;

/**
 * Check whether a company's token usage has crossed any alert thresholds
 * and fire a webhook if so. Fire-and-forget — never throws.
 *
 * Uses database-backed SpendAlertLog to track which alerts have been sent,
 * so alerts survive server restarts and work across instances.
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

      // Check if this alert has already been sent (database-backed, survives restarts)
      const existing = await prisma.spendAlertLog.findUnique({
        where: {
          companyId_monthKey_threshold: {
            companyId,
            monthKey,
            threshold,
          },
        },
      });

      if (existing) continue;

      // Record that we're sending this alert (unique constraint prevents duplicates)
      try {
        await prisma.spendAlertLog.create({
          data: { companyId, monthKey, threshold },
        });
      } catch (e: any) {
        // Unique constraint violation = another instance already sent it
        if (e.code === 'P2002') continue;
        throw e;
      }

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

      if (webhookUrl) {
        try {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        } catch (webhookErr) {
          console.error(`[Token Alert] Failed to send webhook for ${threshold}%:`, webhookErr);
        }
      } else {
        console.log(`[Token Alert] ${message}`, payload);
      }

      // Send email alert to company owner(s) — fire-and-forget
      sendAlertEmails(companyId, companyName, usagePct, used, budget).catch(() => {});
    }
  } catch (err) {
    console.error('[Token Alert] Failed to check alerts:', err);
  }
}

/**
 * Send budget alert emails to all OWNER users of the company.
 * Fire-and-forget — errors are logged, never thrown.
 */
async function sendAlertEmails(
  companyId: string,
  companyName: string,
  percentUsed: number,
  tokensUsed: number,
  budget: number
): Promise<void> {
  try {
    const owners = await prisma.user.findMany({
      where: { companyId, role: 'OWNER' },
      select: { email: true },
    });

    // Send to all owners in parallel; partial failure is fine
    await Promise.allSettled(
      owners.map((owner: { email: string }) =>
        sendTokenBudgetAlert(owner.email, companyName, percentUsed, tokensUsed, budget)
      )
    );
  } catch (err) {
    console.error('[Token Alert] Failed to send alert emails:', err);
  }
}
