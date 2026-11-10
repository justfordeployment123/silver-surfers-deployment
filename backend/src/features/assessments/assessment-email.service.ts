import { sendDirectMail } from '../audits/report-delivery.ts';
import { wrapBillingEmail } from '../billing/billing-email.service.ts';

export function buildAssessmentReportReadyEmail(preview = false, frontendUrl = process.env.FRONTEND_URL || 'https://silversurfers.ai') {
  const dashboardUrl = preview
    ? (process.env.ASSESSMENT_PREVIEW_URL || 'https://staging.silversurfers.ai/assessment-preview')
    : `${frontendUrl.replace(/\/+$/, '')}/dashboard`;
  const subject = preview ? 'Your preview AI Readiness Assessment report is ready' : 'Your AI Readiness Assessment report is ready';
  return { subject, ...wrapBillingEmail({
    subject,
    bannerTitle: 'Your AI Readiness Report',
    heading: 'Your next steps start here.',
    intro: 'Your assessment has been reviewed by the SilverSurfers team. Your report is ready to view in your account.',
    bodyLines: ['Explore practical recommendations shaped around your business, your priorities, and the way your team works.'],
    bullets: ['Understand where AI can help your business.', 'Review opportunities to save time and improve workflows.', 'Plan your next steps with clear priorities and recommended tools.'],
    actionLabel: preview ? 'View your preview report' : 'View your assessment report',
    actionUrl: dashboardUrl,
    footer: 'Sign in with the email address you used for your assessment. Your report is available securely in your account. For help with your results, contact hello@silversurfers.ai.',
  }) };
}

export async function sendAssessmentReportReadyEmail(to: string, preview = false): Promise<ReturnType<typeof sendDirectMail>> {
  return sendDirectMail({ to, ...buildAssessmentReportReadyEmail(preview) });
}
