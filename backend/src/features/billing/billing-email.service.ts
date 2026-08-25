import { sendDirectMail } from '../audits/report-delivery.ts';

type DirectMailResult = Awaited<ReturnType<typeof sendDirectMail>>;

interface BillingEmailContent {
  html: string;
  text: string;
}

function resolveFrontendUrl(frontendUrl: string = process.env.FRONTEND_URL || 'http://localhost:3000'): string {
  return frontendUrl.replace(/\/+$/, '');
}

function formatDate(value: Date | string | number | null | undefined): string {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Same table-based navy-header/blue-button shell as the audit report email
 * (buildAuditReportEmailBody in report-delivery.ts) and the monitoring alert
 * emails (wrapMonitoringEmail) — previously this was a one-off rounded card
 * with a per-email accent color/gradient (blue-green for positive events,
 * red for cancellation, dark neutral for team departures), which read as a
 * different product from the report/monitoring emails. One consistent
 * header across every SilverSurfers email is what actually reads as
 * "not spam", not any one email's own color choice.
 */
function wrapBillingEmail(options: {
  bannerTitle: string;
  heading: string;
  intro: string;
  bodyLines?: string[];
  bullets?: string[];
  actionLabel?: string;
  actionUrl?: string;
  footer: string;
  subject: string;
}): BillingEmailContent {
  const generatedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const bulletList = options.bullets && options.bullets.length > 0
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #d7dde8;border-collapse:collapse;margin:4px 0 20px 0;">
        <tr>
          <td style="padding:16px 20px;font-family:Arial,sans-serif;color:#111827;font-size:14px;line-height:22px;">
            ${options.bullets.map((item) => `&bull;&nbsp; ${escapeHtml(item)}<br/>`).join('')}
          </td>
        </tr>
      </table>
    `
    : '';

  const action = options.actionLabel && options.actionUrl
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 20px 0;">
        <tr>
          <td>
            <a href="${escapeHtml(options.actionUrl)}" target="_blank" rel="noopener noreferrer" style="background:#1f5be3;color:#ffffff;display:inline-block;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;line-height:16px;padding:12px 24px;text-align:center;text-decoration:none;">
              ${escapeHtml(options.actionLabel)}
            </a>
          </td>
        </tr>
      </table>
    `
    : '';

  const bodyParagraphsHtml = (options.bodyLines || [])
    .map((line) => `<div style="font-family:Arial,sans-serif;color:#4b5563;font-size:14px;line-height:20px;padding:0 0 10px 0;">${escapeHtml(line)}</div>`)
    .join('');

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>${escapeHtml(options.bannerTitle)}</title>
    </head>
    <body style="margin:0;padding:0;background:#ffffff;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-collapse:collapse;margin:0;padding:0;">
        <tr>
          <td align="center" style="padding:16px 12px;">
            <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:640px;max-width:640px;">
              <tr>
                <td align="center" style="background:#102447;padding:22px 24px 24px 24px;">
                  <div style="color:#b9c8df;font-family:Arial,sans-serif;font-size:9px;font-weight:bold;letter-spacing:.7px;line-height:12px;text-transform:uppercase;">Silversurfers AI - The Authority on Silver Digital Readiness</div>
                  <div style="color:#ffffff;font-family:Arial,sans-serif;font-size:24px;font-weight:bold;line-height:30px;margin-top:5px;">${escapeHtml(options.bannerTitle)}</div>
                  <div style="color:#dbe5f3;font-family:Arial,sans-serif;font-size:12px;line-height:16px;margin-top:3px;">${escapeHtml(generatedDate)}</div>
                </td>
              </tr>
              <tr>
                <td style="font-family:Arial,sans-serif;color:#111827;font-size:18px;font-weight:bold;line-height:23px;padding:26px 0 8px 0;">
                  ${escapeHtml(options.heading)}
                </td>
              </tr>
              <tr>
                <td style="font-family:Arial,sans-serif;color:#4b5563;font-size:15px;line-height:20px;padding:0 0 14px 0;">
                  ${escapeHtml(options.intro)}
                </td>
              </tr>
              <tr>
                <td>
                  ${bodyParagraphsHtml}
                  ${bulletList}
                  ${action}
                </td>
              </tr>
              <tr>
                <td style="border-top:1px solid #d7dde8;font-family:Arial,sans-serif;color:#4b5563;font-size:13px;line-height:18px;padding:20px 0 20px 0;">
                  ${escapeHtml(options.footer)}
                </td>
              </tr>
              <tr>
                <td align="center" style="background:#f5f7fb;font-family:Arial,sans-serif;color:#6b7280;font-size:10px;line-height:15px;padding:16px 20px;">
                  This email was generated automatically - please don't reply directly.<br />
                  Questions? Reach our team at hello@silversurfers.ai.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `.trim();

  const text = [
    options.subject,
    '',
    options.heading,
    options.intro,
    '',
    ...(options.bodyLines || []),
    '',
    ...((options.bullets || []).map((item) => `- ${item}`)),
    ...(options.actionLabel && options.actionUrl ? ['', `${options.actionLabel}: ${options.actionUrl}`] : []),
    '',
    options.footer,
    '',
    "This email was generated automatically - please don't reply directly.",
    'Questions? Reach our team at hello@silversurfers.ai.',
  ]
    .filter((line, index, lines) => !(line === '' && lines[index - 1] === ''))
    .join('\n');

  return { html, text };
}

function planFeatureBullets(planName: string): string[] {
  const normalized = planName.trim().toLowerCase();

  if (normalized === 'starter') {
    return [
      '60 accessibility scans per year',
      'Single-user account',
      'Detailed PDF reports',
      'Priority email support',
    ];
  }

  if (normalized === 'pro') {
    return [
      '144 accessibility scans per year',
      'Team access for up to 3 users',
      'Historical tracking and white-label reports',
      'SilverSurfers Seal eligibility',
    ];
  }

  if (normalized === 'custom') {
    return [
      'Unlimited scans and team users',
      'Advanced analytics and API access',
      'Custom integrations and dedicated support',
    ];
  }

  return [
    'Accessibility scans and reports',
    'Actionable remediation guidance',
    'Secure account-based delivery',
  ];
}

export function buildTeamInvitationEmailContent(
  ownerEmail: string,
  ownerName: string,
  planName: string,
  invitationToken: string,
  frontendUrl?: string,
): BillingEmailContent {
  const invitationLink = `${resolveFrontendUrl(frontendUrl)}/team/accept?token=${encodeURIComponent(invitationToken)}`;

  return wrapBillingEmail({
    subject: `${ownerName || ownerEmail} invited you to join their SilverSurfers team`,
    bannerTitle: "You're Invited to Join SilverSurfers",
    heading: 'Team Invitation',
    intro: `${ownerName || ownerEmail} has invited you to join their SilverSurfers team on the ${planName} plan.`,
    bodyLines: [
      'As a team member, you will share access to scans, reports, and subscription-backed features.',
    ],
    bullets: [
      'Website accessibility audits',
      'Detailed report downloads',
      'Shared team usage limits',
      'Priority support',
    ],
    actionLabel: 'Accept Invitation',
    actionUrl: invitationLink,
    footer: 'If you do not have an account yet, you can create one after opening the invitation link.',
  });
}

export function buildSubscriptionCancellationEmailContent(
  planName: string,
  cancelAtPeriodEnd: boolean,
  currentPeriodEnd?: Date | string | null,
): BillingEmailContent {
  const formattedDate = formatDate(currentPeriodEnd);
  const bodyLines = cancelAtPeriodEnd
    ? [
        `Your subscription will remain active until ${formattedDate || 'the end of the current billing period'}.`,
        'After that date, premium access will end unless you reactivate the subscription.',
      ]
    : [
        'Your subscription has been cancelled immediately and premium access has ended.',
      ];

  return wrapBillingEmail({
    subject: 'Subscription Cancelled - SilverSurfers',
    bannerTitle: 'Subscription Cancelled',
    heading: `Your ${planName} subscription has been cancelled`,
    intro: cancelAtPeriodEnd
      ? 'Your cancellation request is confirmed.'
      : 'Your subscription cancellation has been processed.',
    bodyLines,
    footer: 'You can return at any time by purchasing a new subscription from your dashboard.',
  });
}

export function buildSubscriptionReinstatementEmailContent(planName: string): BillingEmailContent {
  return wrapBillingEmail({
    subject: 'Subscription Reactivated - SilverSurfers',
    bannerTitle: 'Subscription Reactivated',
    heading: 'Welcome back to SilverSurfers',
    intro: `Your ${planName} subscription has been successfully reactivated.`,
    bodyLines: [
      'Your premium access is live again and all included features are available in your account.',
    ],
    footer: 'Thank you for continuing with SilverSurfers.',
  });
}

export function buildSubscriptionWelcomeEmailContent(
  planName: string,
  billingCycle: string = 'yearly',
  currentPeriodEnd?: Date | string | null,
): BillingEmailContent {
  const formattedDate = formatDate(currentPeriodEnd);
  const cycleLabel = billingCycle === 'monthly' ? 'monthly' : 'yearly';

  return wrapBillingEmail({
    subject: 'Welcome to SilverSurfers',
    bannerTitle: 'Subscription Activated',
    heading: `Welcome to the ${planName} plan`,
    intro: `Your ${cycleLabel} SilverSurfers subscription is now active.`,
    bodyLines: [
      ...(formattedDate ? [`Your current billing period runs through ${formattedDate}.`] : []),
      'You can start running audits and reviewing reports from your dashboard right away.',
    ],
    bullets: planFeatureBullets(planName),
    footer: 'We are glad to have you on board.',
  });
}

export function buildOneTimePurchaseEmailContent(planName: string): BillingEmailContent {
  return wrapBillingEmail({
    subject: 'Purchase Confirmation - SilverSurfers',
    bannerTitle: 'Purchase Confirmed',
    heading: 'Your one-time purchase is ready',
    intro: `Your ${planName} purchase has been confirmed.`,
    bodyLines: [
      'A one-time scan credit has been added to your account and is ready to use.',
    ],
    footer: 'You can launch your scan from the dashboard whenever you are ready.',
  });
}

export function buildTeamMemberRemovedEmailContent(ownerEmail: string, ownerName: string, planName: string): BillingEmailContent {
  return wrapBillingEmail({
    subject: 'Team Access Removed - SilverSurfers',
    bannerTitle: 'Team Access Removed',
    heading: 'Team Membership Ended',
    intro: `Your access to the SilverSurfers team managed by ${ownerName || ownerEmail} has been removed.`,
    bodyLines: [
      `This change was made on the ${planName} plan.`,
      'You can still create your own subscription if you would like to continue using SilverSurfers.',
    ],
    footer: 'If you believe this was a mistake, please contact the team owner.',
  });
}

export function buildTeamMemberLeftNotificationContent(memberEmail: string, memberName: string, planName: string): BillingEmailContent {
  return wrapBillingEmail({
    subject: 'Team Member Left - SilverSurfers',
    bannerTitle: 'Team Member Left',
    heading: `${memberName || memberEmail} left your team`,
    intro: `${memberName || memberEmail} is no longer part of your SilverSurfers team.`,
    bodyLines: [
      `They no longer have access under your ${planName} subscription.`,
    ],
    footer: 'You can invite another team member at any time from the subscription dashboard.',
  });
}

export function buildTeamMemberLeftConfirmationContent(ownerEmail: string, ownerName: string, planName: string): BillingEmailContent {
  return wrapBillingEmail({
    subject: 'You Left the Team - SilverSurfers',
    bannerTitle: 'You Left the Team',
    heading: 'Team Membership Ended',
    intro: `You have successfully left the SilverSurfers team managed by ${ownerName || ownerEmail}.`,
    bodyLines: [
      `Your access under the ${planName} plan has ended.`,
    ],
    footer: 'Thank you for using SilverSurfers.',
  });
}

export function buildNewTeamMemberNotificationContent(memberEmail: string, memberName: string, planName: string): BillingEmailContent {
  return wrapBillingEmail({
    subject: 'New Team Member Joined Your SilverSurfers Team',
    bannerTitle: 'New Team Member Joined',
    heading: 'A new team member joined your workspace',
    intro: `${memberName || memberEmail} has joined your SilverSurfers team.`,
    bodyLines: [
      `They now share access under your ${planName} subscription.`,
    ],
    footer: 'You can manage your team from the subscription dashboard.',
  });
}

export async function sendTeamInvitationEmail(
  to: string,
  ownerEmail: string,
  ownerName: string,
  planName: string,
  invitationToken: string,
): Promise<DirectMailResult> {
  const content = buildTeamInvitationEmailContent(ownerEmail, ownerName, planName, invitationToken);
  return sendDirectMail({
    to,
    subject: `${ownerName || ownerEmail} invited you to join their SilverSurfers team`,
    html: content.html,
    text: content.text,
  });
}

export async function sendTeamMemberRemovedEmail(
  to: string,
  ownerEmail: string,
  ownerName: string,
  planName: string,
): Promise<DirectMailResult> {
  const content = buildTeamMemberRemovedEmailContent(ownerEmail, ownerName, planName);
  return sendDirectMail({
    to,
    subject: 'Team Access Removed - SilverSurfers',
    html: content.html,
    text: content.text,
  });
}

export async function sendTeamMemberLeftNotification(
  ownerEmail: string,
  memberEmail: string,
  memberName: string,
  planName: string,
): Promise<DirectMailResult> {
  const content = buildTeamMemberLeftNotificationContent(memberEmail, memberName, planName);
  return sendDirectMail({
    to: ownerEmail,
    subject: 'Team Member Left - SilverSurfers',
    html: content.html,
    text: content.text,
  });
}

export async function sendTeamMemberLeftConfirmation(
  memberEmail: string,
  ownerEmail: string,
  ownerName: string,
  planName: string,
): Promise<DirectMailResult> {
  const content = buildTeamMemberLeftConfirmationContent(ownerEmail, ownerName, planName);
  return sendDirectMail({
    to: memberEmail,
    subject: 'You Left the Team - SilverSurfers',
    html: content.html,
    text: content.text,
  });
}

export async function sendNewTeamMemberNotification(
  ownerEmail: string,
  memberEmail: string,
  memberName: string,
  planName: string,
): Promise<DirectMailResult> {
  const content = buildNewTeamMemberNotificationContent(memberEmail, memberName, planName);
  return sendDirectMail({
    to: ownerEmail,
    subject: 'New Team Member Joined Your SilverSurfers Team',
    html: content.html,
    text: content.text,
  });
}

export async function sendSubscriptionCancellationEmail(
  to: string,
  planName: string,
  cancelAtPeriodEnd: boolean = true,
  currentPeriodEnd: Date | string | null = null,
): Promise<DirectMailResult> {
  const content = buildSubscriptionCancellationEmailContent(planName, cancelAtPeriodEnd, currentPeriodEnd);
  return sendDirectMail({
    to,
    subject: 'Subscription Cancelled - SilverSurfers',
    html: content.html,
    text: content.text,
  });
}

export async function sendSubscriptionReinstatementEmail(to: string, planName: string): Promise<DirectMailResult> {
  const content = buildSubscriptionReinstatementEmailContent(planName);
  return sendDirectMail({
    to,
    subject: 'Subscription Reactivated - SilverSurfers',
    html: content.html,
    text: content.text,
  });
}

export async function sendSubscriptionWelcomeEmail(
  to: string,
  planName: string,
  billingCycle: string = 'yearly',
  currentPeriodEnd: Date | string | null = null,
): Promise<DirectMailResult> {
  const content = buildSubscriptionWelcomeEmailContent(planName, billingCycle, currentPeriodEnd);
  return sendDirectMail({
    to,
    subject: 'Welcome to SilverSurfers',
    html: content.html,
    text: content.text,
  });
}

export async function sendOneTimePurchaseEmail(to: string, planName: string): Promise<DirectMailResult> {
  const content = buildOneTimePurchaseEmailContent(planName);
  return sendDirectMail({
    to,
    subject: 'Purchase Confirmation - SilverSurfers',
    html: content.html,
    text: content.text,
  });
}
