/**
 * Transactional email service using Resend.
 *
 * All functions are fire-and-forget: they log errors but never throw,
 * so callers can safely call without awaiting or wrapping in try/catch.
 */

import { Resend } from 'resend';

// Lazy-initialized Resend client
let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Email] RESEND_API_KEY not set — emails will be skipped');
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

function getFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL || 'Ad Maker <noreply@admaker.io>';
}

function getAppUrl(): string {
  return process.env.NEXTAUTH_URL || 'http://localhost:3000';
}

/** Basic HTML entity escaping to prevent injection in email templates. */
function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Shared HTML wrapper — dark theme, professional, minimal
// ---------------------------------------------------------------------------

function wrapHtml(title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #2a2a2a;">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Ad Maker</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #2a2a2a;">
              <p style="margin:0;font-size:13px;color:#666;line-height:1.5;">
                This email was sent by <a href="${getAppUrl()}" style="color:#3b82f6;text-decoration:none;">Ad Maker</a>.
                If you didn't expect this email, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(text: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;padding:12px 28px;background:#3b82f6;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;margin:8px 0;">${text}</a>`;
}

// ---------------------------------------------------------------------------
// 1. Welcome Email
// ---------------------------------------------------------------------------

export async function sendWelcomeEmail(
  to: string,
  name: string,
  tokenBalance: number
): Promise<{ success: boolean }> {
  try {
    const resend = getResend();
    if (!resend) return { success: false };

    const displayName = esc(name || 'there');
    const appUrl = getAppUrl();

    const html = wrapHtml('Welcome to Ad Maker', `
      <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">Welcome, ${displayName}!</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#d1d5db;line-height:1.6;">
        Your account is ready. You're on the <strong style="color:#ffffff;">Free plan</strong> with
        <strong style="color:#22c55e;">${tokenBalance} tokens</strong> to get started.
      </p>
      <h3 style="margin:24px 0 12px;font-size:16px;color:#ffffff;">Getting started</h3>
      <ol style="margin:0 0 24px;padding-left:20px;font-size:15px;color:#d1d5db;line-height:1.8;">
        <li>Create a project and fill in your ad brief</li>
        <li>Review and approve the AI-generated ad copy</li>
        <li>Upload your background videos and music</li>
        <li>Render your finished video ads</li>
      </ol>
      <p style="margin:0 0 8px;font-size:15px;color:#d1d5db;">
        Ad copy generation is <strong style="color:#22c55e;">always free</strong> — tokens are only
        used when rendering finished videos.
      </p>
      <div style="margin:24px 0 0;text-align:center;">
        ${button('Go to Ad Maker', appUrl)}
      </div>
    `);

    await resend.emails.send({
      from: getFromEmail(),
      to,
      subject: 'Welcome to Ad Maker — your account is ready',
      html,
    });

    return { success: true };
  } catch (error) {
    console.error('[Email] Failed to send welcome email:', error);
    return { success: false };
  }
}

// ---------------------------------------------------------------------------
// 2. Password Reset Email
// ---------------------------------------------------------------------------

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  resetUrl: string
): Promise<{ success: boolean }> {
  try {
    const resend = getResend();
    if (!resend) return { success: false };

    const displayName = esc(name || 'there');

    const html = wrapHtml('Reset Your Password', `
      <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">Reset your password</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#d1d5db;line-height:1.6;">
        Hi ${displayName}, we received a request to reset the password for your Ad Maker account.
        Click the button below to choose a new password.
      </p>
      <div style="margin:24px 0;text-align:center;">
        ${button('Reset Password', resetUrl)}
      </div>
      <p style="margin:0 0 8px;font-size:14px;color:#9ca3af;line-height:1.6;">
        This link expires in <strong style="color:#d1d5db;">1 hour</strong>.
        If you didn't request a password reset, you can safely ignore this email.
      </p>
      <p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.6;word-break:break-all;">
        If the button doesn't work, copy and paste this URL into your browser:<br />
        <a href="${resetUrl}" style="color:#3b82f6;text-decoration:none;">${resetUrl}</a>
      </p>
    `);

    await resend.emails.send({
      from: getFromEmail(),
      to,
      subject: 'Reset your Ad Maker password',
      html,
    });

    return { success: true };
  } catch (error) {
    console.error('[Email] Failed to send password reset email:', error);
    return { success: false };
  }
}

// ---------------------------------------------------------------------------
// 3. Plan Upgrade Confirmation
// ---------------------------------------------------------------------------

export async function sendPlanUpgradeEmail(
  to: string,
  name: string,
  planName: string,
  tokenBalance: number
): Promise<{ success: boolean }> {
  try {
    const resend = getResend();
    if (!resend) return { success: false };

    const displayName = esc(name || 'there');
    const escapedPlanName = esc(planName);
    const appUrl = getAppUrl();

    const html = wrapHtml('Plan Upgrade Confirmed', `
      <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">Plan upgraded!</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#d1d5db;line-height:1.6;">
        Hi ${displayName}, your Ad Maker plan has been upgraded to
        <strong style="color:#3b82f6;">${escapedPlanName}</strong>.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#262626;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:20px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:14px;color:#9ca3af;">Current plan</td>
                <td align="right" style="font-size:15px;color:#ffffff;font-weight:600;">${escapedPlanName}</td>
              </tr>
              <tr>
                <td style="padding-top:12px;font-size:14px;color:#9ca3af;">Token balance</td>
                <td align="right" style="padding-top:12px;font-size:15px;color:#22c55e;font-weight:600;">${tokenBalance.toLocaleString()} tokens</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;font-size:15px;color:#d1d5db;line-height:1.6;">
        You now have access to more tokens, team members, and storage.
        Visit your billing page to see full plan details.
      </p>
      <div style="margin:24px 0 0;text-align:center;">
        ${button('View Billing', `${appUrl}/billing`)}
      </div>
    `);

    await resend.emails.send({
      from: getFromEmail(),
      to,
      subject: `Plan upgraded to ${escapedPlanName} — Ad Maker`,
      html,
    });

    return { success: true };
  } catch (error) {
    console.error('[Email] Failed to send plan upgrade email:', error);
    return { success: false };
  }
}

// ---------------------------------------------------------------------------
// 4. Token Budget Alert
// ---------------------------------------------------------------------------

export async function sendTokenBudgetAlert(
  to: string,
  companyName: string,
  percentUsed: number,
  tokensUsed: number,
  budget: number
): Promise<{ success: boolean }> {
  try {
    const resend = getResend();
    if (!resend) return { success: false };

    const appUrl = getAppUrl();
    const escapedCompanyName = esc(companyName);
    const isOverBudget = percentUsed >= 100;
    const alertColor = isOverBudget ? '#ef4444' : percentUsed >= 80 ? '#f59e0b' : '#3b82f6';
    const alertLabel = isOverBudget ? 'Budget exceeded' : `${Math.round(percentUsed)}% of budget used`;

    const html = wrapHtml('Token Budget Alert', `
      <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">Token budget alert</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#d1d5db;line-height:1.6;">
        <strong style="color:#ffffff;">${escapedCompanyName}</strong> has reached
        <strong style="color:${alertColor};">${alertLabel}</strong> for the current billing period.
      </p>
      <!-- Progress bar -->
      <div style="margin:24px 0;background:#262626;border-radius:8px;overflow:hidden;">
        <div style="padding:20px 24px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
            <span style="font-size:14px;color:#9ca3af;">Usage</span>
            <span style="font-size:14px;color:#ffffff;font-weight:600;">${tokensUsed.toLocaleString()} / ${budget.toLocaleString()} tokens</span>
          </div>
          <div style="background:#404040;border-radius:4px;height:8px;overflow:hidden;">
            <div style="background:${alertColor};height:100%;width:${Math.min(percentUsed, 100)}%;border-radius:4px;"></div>
          </div>
        </div>
      </div>
      <p style="margin:0 0 8px;font-size:15px;color:#d1d5db;line-height:1.6;">
        ${isOverBudget
          ? 'Your team has exceeded the monthly token budget. New render operations will be blocked until the budget is increased or the next billing period begins.'
          : 'Consider adjusting your monthly token budget in Settings if your team needs more capacity.'}
      </p>
      <div style="margin:24px 0 0;text-align:center;">
        ${button('Manage Budget', `${appUrl}/settings`)}
      </div>
    `);

    await resend.emails.send({
      from: getFromEmail(),
      to,
      subject: `${isOverBudget ? 'Budget exceeded' : `${Math.round(percentUsed)}% budget used`} — ${escapedCompanyName} — Ad Maker`,
      html,
    });

    return { success: true };
  } catch (error) {
    console.error('[Email] Failed to send token budget alert:', error);
    return { success: false };
  }
}

// ---------------------------------------------------------------------------
// 5. Payment Receipt
// ---------------------------------------------------------------------------

export async function sendPaymentReceiptEmail(
  to: string,
  name: string,
  amount: string,
  description: string
): Promise<{ success: boolean }> {
  try {
    const resend = getResend();
    if (!resend) return { success: false };

    const displayName = esc(name || 'there');
    const escapedAmount = esc(amount);
    const escapedDescription = esc(description);
    const appUrl = getAppUrl();
    const date = new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const html = wrapHtml('Payment Receipt', `
      <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">Payment receipt</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#d1d5db;line-height:1.6;">
        Hi ${displayName}, here's your receipt for a payment to Ad Maker.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#262626;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:20px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:14px;color:#9ca3af;">Date</td>
                <td align="right" style="font-size:15px;color:#ffffff;">${date}</td>
              </tr>
              <tr>
                <td style="padding-top:12px;font-size:14px;color:#9ca3af;">Description</td>
                <td align="right" style="font-size:15px;color:#ffffff;">${escapedDescription}</td>
              </tr>
              <tr>
                <td style="padding-top:12px;font-size:14px;color:#9ca3af;border-top:1px solid #404040;padding-top:16px;margin-top:4px;">Amount paid</td>
                <td align="right" style="padding-top:12px;font-size:18px;color:#22c55e;font-weight:700;border-top:1px solid #404040;padding-top:16px;">${escapedAmount}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;font-size:14px;color:#9ca3af;line-height:1.6;">
        You can view your full transaction history on the usage page.
      </p>
      <div style="margin:24px 0 0;text-align:center;">
        ${button('View Usage', `${appUrl}/usage`)}
      </div>
    `);

    await resend.emails.send({
      from: getFromEmail(),
      to,
      subject: `Payment receipt: ${escapedAmount} — Ad Maker`,
      html,
    });

    return { success: true };
  } catch (error) {
    console.error('[Email] Failed to send payment receipt email:', error);
    return { success: false };
  }
}

// ---------------------------------------------------------------------------
// 6. Team Invite Email
// ---------------------------------------------------------------------------

export async function sendTeamInviteEmail(
  to: string,
  name: string,
  companyName: string,
  tempPassword: string,
  loginUrl: string
): Promise<{ success: boolean }> {
  try {
    const resend = getResend();
    if (!resend) return { success: false };

    const displayName = esc(name || 'there');
    const escapedCompany = esc(companyName);

    const html = wrapHtml('You\'ve Been Invited', `
      <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">You've been invited!</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#d1d5db;line-height:1.6;">
        Hi ${displayName}, you've been invited to join <strong style="color:#ffffff;">${escapedCompany}</strong> on Ad Maker.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#262626;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:20px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:14px;color:#9ca3af;">Email</td>
                <td align="right" style="font-size:15px;color:#ffffff;">${esc(to)}</td>
              </tr>
              <tr>
                <td style="padding-top:12px;font-size:14px;color:#9ca3af;">Temporary password</td>
                <td align="right" style="padding-top:12px;font-size:15px;color:#22c55e;font-weight:600;font-family:monospace;">${esc(tempPassword)}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;font-size:14px;color:#f59e0b;line-height:1.6;">
        <strong>Important:</strong> Please change your password after your first login.
      </p>
      <div style="margin:24px 0 0;text-align:center;">
        ${button('Log In to Ad Maker', loginUrl)}
      </div>
      <p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.6;word-break:break-all;">
        If the button doesn't work, copy and paste this URL:<br />
        <a href="${loginUrl}" style="color:#3b82f6;text-decoration:none;">${loginUrl}</a>
      </p>
    `);

    await resend.emails.send({
      from: getFromEmail(),
      to,
      subject: `You've been invited to join ${escapedCompany} on Ad Maker`,
      html,
    });

    return { success: true };
  } catch (error) {
    console.error('[Email] Failed to send team invite email:', error);
    return { success: false };
  }
}

// ---------------------------------------------------------------------------
// 7. Render Complete Email
// ---------------------------------------------------------------------------

export async function sendRenderCompleteEmail(
  to: string,
  name: string,
  videoCount: number,
  projectName?: string,
  downloadUrl?: string
): Promise<{ success: boolean }> {
  try {
    const resend = getResend();
    if (!resend) return { success: false };

    const displayName = esc(name || 'there');
    const appUrl = getAppUrl();
    const projectLabel = projectName ? esc(projectName) : 'your project';
    const viewUrl = downloadUrl || appUrl;

    const html = wrapHtml('Your Videos Are Ready', `
      <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">Your ${videoCount} video${videoCount !== 1 ? 's are' : ' is'} ready!</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#d1d5db;line-height:1.6;">
        Hi ${displayName}, the render for <strong style="color:#ffffff;">${projectLabel}</strong> has finished.
        ${videoCount} video${videoCount !== 1 ? 's have' : ' has'} been rendered and ${videoCount !== 1 ? 'are' : 'is'} ready to download.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#262626;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:20px 24px;text-align:center;">
            <span style="font-size:36px;font-weight:700;color:#22c55e;">${videoCount}</span>
            <p style="margin:4px 0 0;font-size:14px;color:#9ca3af;">video${videoCount !== 1 ? 's' : ''} rendered</p>
          </td>
        </tr>
      </table>
      <div style="margin:24px 0 0;text-align:center;">
        ${button('View & Download', viewUrl)}
      </div>
    `);

    await resend.emails.send({
      from: getFromEmail(),
      to,
      subject: `Your ${videoCount} video${videoCount !== 1 ? 's are' : ' is'} ready — Ad Maker`,
      html,
    });

    return { success: true };
  } catch (error) {
    console.error('[Email] Failed to send render complete email:', error);
    return { success: false };
  }
}

// ---------------------------------------------------------------------------
// 8. Render Failed Email
// ---------------------------------------------------------------------------

export async function sendRenderFailedEmail(
  to: string,
  name: string,
  failedCount: number,
  totalCount: number,
  projectName?: string
): Promise<{ success: boolean }> {
  try {
    const resend = getResend();
    if (!resend) return { success: false };

    const displayName = esc(name || 'there');
    const appUrl = getAppUrl();
    const projectLabel = projectName ? esc(projectName) : 'your project';
    const successCount = totalCount - failedCount;

    const html = wrapHtml('Render Issues', `
      <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">Render partially failed</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#d1d5db;line-height:1.6;">
        Hi ${displayName}, <strong style="color:#ef4444;">${failedCount} of ${totalCount}</strong> renders
        for <strong style="color:#ffffff;">${projectLabel}</strong> encountered errors.
        ${successCount > 0 ? `The other ${successCount} video${successCount !== 1 ? 's' : ''} rendered successfully.` : ''}
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#262626;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:20px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:14px;color:#9ca3af;">Succeeded</td>
                <td align="right" style="font-size:15px;color:#22c55e;font-weight:600;">${successCount}</td>
              </tr>
              <tr>
                <td style="padding-top:12px;font-size:14px;color:#9ca3af;">Failed</td>
                <td align="right" style="padding-top:12px;font-size:15px;color:#ef4444;font-weight:600;">${failedCount}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;font-size:15px;color:#d1d5db;line-height:1.6;">
        You can retry the failed renders from the app.
      </p>
      <div style="margin:24px 0 0;text-align:center;">
        ${button('Retry in App', appUrl)}
      </div>
    `);

    await resend.emails.send({
      from: getFromEmail(),
      to,
      subject: `${failedCount} of ${totalCount} renders failed — Ad Maker`,
      html,
    });

    return { success: true };
  } catch (error) {
    console.error('[Email] Failed to send render failed email:', error);
    return { success: false };
  }
}

// ---------------------------------------------------------------------------
// 9. Subscription Renewal Email
// ---------------------------------------------------------------------------

export async function sendSubscriptionRenewalEmail(
  to: string,
  name: string,
  plan: string,
  tokensAdded: number
): Promise<{ success: boolean }> {
  try {
    const resend = getResend();
    if (!resend) return { success: false };

    const displayName = esc(name || 'there');
    const escapedPlan = esc(plan);
    const appUrl = getAppUrl();

    const html = wrapHtml('Subscription Renewed', `
      <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">Subscription renewed</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#d1d5db;line-height:1.6;">
        Hi ${displayName}, your <strong style="color:#3b82f6;">${escapedPlan}</strong> subscription
        has been renewed and your tokens have been topped up.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#262626;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:20px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:14px;color:#9ca3af;">Plan</td>
                <td align="right" style="font-size:15px;color:#ffffff;font-weight:600;">${escapedPlan}</td>
              </tr>
              <tr>
                <td style="padding-top:12px;font-size:14px;color:#9ca3af;">Tokens added</td>
                <td align="right" style="padding-top:12px;font-size:15px;color:#22c55e;font-weight:600;">+${tokensAdded.toLocaleString()} tokens</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;font-size:15px;color:#d1d5db;line-height:1.6;">
        Your team can continue creating video ads. Visit the billing page to see your current balance.
      </p>
      <div style="margin:24px 0 0;text-align:center;">
        ${button('View Billing', `${appUrl}/billing`)}
      </div>
    `);

    await resend.emails.send({
      from: getFromEmail(),
      to,
      subject: `${escapedPlan} subscription renewed — ${tokensAdded} tokens added — Ad Maker`,
      html,
    });

    return { success: true };
  } catch (error) {
    console.error('[Email] Failed to send subscription renewal email:', error);
    return { success: false };
  }
}

// ---------------------------------------------------------------------------
// 10. Ticket Created Confirmation Email
// ---------------------------------------------------------------------------

export async function sendTicketCreatedEmail(
  to: string,
  name: string,
  ticketNumber: string,
  subject: string
): Promise<{ success: boolean }> {
  try {
    const resend = getResend();
    if (!resend) return { success: false };

    const displayName = esc(name || 'there');
    const escapedSubject = esc(subject);
    const appUrl = getAppUrl();

    const html = wrapHtml('Support Ticket Created', `
      <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">We received your ticket</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#d1d5db;line-height:1.6;">
        Hi ${displayName}, your support ticket has been created. We'll get back to you as soon as possible.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#262626;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:20px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:14px;color:#9ca3af;">Ticket</td>
                <td align="right" style="font-size:15px;color:#3b82f6;font-weight:600;">#${esc(ticketNumber)}</td>
              </tr>
              <tr>
                <td style="padding-top:12px;font-size:14px;color:#9ca3af;">Subject</td>
                <td align="right" style="padding-top:12px;font-size:15px;color:#ffffff;font-weight:600;">${escapedSubject}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <div style="margin:24px 0 0;text-align:center;">
        ${button('View Ticket', `${appUrl}/tickets`)}
      </div>
    `);

    await resend.emails.send({
      from: getFromEmail(),
      to,
      subject: `Ticket #${ticketNumber} created — ${subject} — Ad Maker`,
      html,
    });

    return { success: true };
  } catch (error) {
    console.error('[Email] Failed to send ticket created email:', error);
    return { success: false };
  }
}

// ---------------------------------------------------------------------------
// 11. Ticket Reply Notification Email
// ---------------------------------------------------------------------------

export async function sendTicketReplyEmail(
  to: string,
  name: string,
  ticketNumber: string,
  subject: string
): Promise<{ success: boolean }> {
  try {
    const resend = getResend();
    if (!resend) return { success: false };

    const displayName = esc(name || 'there');
    const escapedSubject = esc(subject);
    const appUrl = getAppUrl();

    const html = wrapHtml('New Reply on Your Ticket', `
      <h2 style="margin:0 0 16px;font-size:20px;color:#ffffff;">New reply on your ticket</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#d1d5db;line-height:1.6;">
        Hi ${displayName}, our support team has replied to your ticket.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#262626;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:20px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:14px;color:#9ca3af;">Ticket</td>
                <td align="right" style="font-size:15px;color:#3b82f6;font-weight:600;">#${esc(ticketNumber)}</td>
              </tr>
              <tr>
                <td style="padding-top:12px;font-size:14px;color:#9ca3af;">Subject</td>
                <td align="right" style="padding-top:12px;font-size:15px;color:#ffffff;font-weight:600;">${escapedSubject}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;font-size:15px;color:#d1d5db;line-height:1.6;">
        Log in to view the full reply and respond.
      </p>
      <div style="margin:24px 0 0;text-align:center;">
        ${button('View Ticket', `${appUrl}/tickets`)}
      </div>
    `);

    await resend.emails.send({
      from: getFromEmail(),
      to,
      subject: `Reply on ticket #${ticketNumber} — ${subject} — Ad Maker`,
      html,
    });

    return { success: true };
  } catch (error) {
    console.error('[Email] Failed to send ticket reply email:', error);
    return { success: false };
  }
}
