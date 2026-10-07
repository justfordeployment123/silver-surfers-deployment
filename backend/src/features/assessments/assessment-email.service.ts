import { sendDirectMail } from '../audits/report-delivery.ts';

// Milestone 3.1 Developer Plan, Module 13 ("send the customer-notification
// email"). Deliberately simple — not billing-email.service.ts's full
// navy-header table-based template, since that wrapper function isn't
// exported and duplicating ~150 lines of HTML for one notification isn't
// worth it right now. Revisit if/when more assessment emails are added
// (e.g. a staff "intake complete, awaiting review" notification, Module 14).
function resolveFrontendUrl(): string {
  return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

export async function sendAssessmentReportReadyEmail(to: string): Promise<ReturnType<typeof sendDirectMail>> {
  const dashboardUrl = `${resolveFrontendUrl()}/dashboard`;

  return sendDirectMail({
    to,
    subject: 'Your AI Readiness Assessment report is ready',
    html: `
      <p>Your AI Readiness Assessment report has been reviewed and is now ready to view.</p>
      <p><a href="${dashboardUrl}">View your report on your SilverSurfers.ai dashboard</a></p>
    `,
    text: `Your AI Readiness Assessment report has been reviewed and is now ready to view.\n\nView it here: ${dashboardUrl}`,
  });
}
