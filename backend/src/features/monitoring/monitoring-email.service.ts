interface MonitoringEmailContent {
  html: string;
  text: string;
}

interface MonitoringIssueLike {
  title?: string;
  severity?: string;
}

function resolveFrontendUrl(): string {
  return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

/** Report link for whichever record type the run's scan produced. */
export function buildReportUrl(auditModel: 'AnalysisRecord' | 'QuickScan', options: { taskId?: string; auditId?: string }): string {
  const base = resolveFrontendUrl();
  if (auditModel === 'AnalysisRecord' && options.taskId) {
    return `${base}/account/analysis/${encodeURIComponent(options.taskId)}`;
  }
  return `${base}/account/quick-scans/${encodeURIComponent(options.auditId || '')}`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Strips the protocol for display in subject lines and the header stat strip — a bare
 * domain reads as a professional report subject, a raw URL reads as a phishing/spam tell. */
function displayDomain(domain: string): string {
  return String(domain || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '') || domain;
}

/**
 * Shared branded wrapper for all monitoring alert emails — a table-based layout matching
 * the same navy-header / stat-strip / blue-button system used by the audit report email
 * (see buildAuditReportEmailBody in report-delivery.ts), rather than the earlier ad-hoc
 * div-based template. Table layout renders consistently in Outlook and other clients that
 * ignore modern CSS, and a consistent header/footer across every SilverSurfers email is
 * what actually reads as "not spam" rather than any one visual trick.
 */
function wrapMonitoringEmail(options: {
  subject: string;
  preheader: string;
  eyebrowRight: string;
  heading: string;
  domain: string;
  intro: string;
  stats?: Array<{ label: string; value: string }>;
  bodyLines?: string[];
  bullets?: string[];
  actionLabel?: string;
  actionUrl?: string;
  footerNote: string;
}): MonitoringEmailContent {
  const generatedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const preheaderText = escapeHtml(options.preheader);

  const statsHtml = options.stats && options.stats.length > 0
    ? `
      <tr>
        <td style="border-bottom:1px solid #d7dde8;padding:22px 0 0 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              ${options.stats.map((stat, index) => `
                <td align="center" width="${Math.floor(100 / options.stats!.length)}%" style="${index < options.stats!.length - 1 ? 'border-right:1px solid #d7dde8;' : ''}font-family:Arial,sans-serif;padding:9px 6px 13px 6px;">
                  <div style="color:#596274;font-size:9px;letter-spacing:.8px;line-height:12px;text-transform:uppercase;">${escapeHtml(stat.label)}</div>
                  <div style="color:#111827;font-size:14px;font-weight:bold;line-height:18px;">${escapeHtml(stat.value)}</div>
                </td>
              `).join('')}
            </tr>
          </table>
        </td>
      </tr>
    `
    : '';

  const bodyParagraphsHtml = (options.bodyLines || [])
    .map((line) => `<div style="font-family:Arial,sans-serif;color:#4b5563;font-size:14px;line-height:20px;padding:0 0 10px 0;">${line}</div>`)
    .join('');

  const bulletsHtml = options.bullets && options.bullets.length > 0
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #d7dde8;border-collapse:collapse;margin:4px 0 20px 0;">
        <tr>
          <td style="padding:16px 20px;font-family:Arial,sans-serif;color:#111827;font-size:14px;line-height:22px;">
            ${options.bullets.map((item) => `&bull;&nbsp; ${item}<br/>`).join('')}
          </td>
        </tr>
      </table>
    `
    : '';

  const actionHtml = options.actionLabel && options.actionUrl
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 4px 0;">
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

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>${escapeHtml(options.heading)}</title>
    </head>
    <body style="margin:0;padding:0;background:#ffffff;">
      <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheaderText}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-collapse:collapse;margin:0;padding:0;">
        <tr>
          <td align="center" style="padding:16px 12px;">
            <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:640px;max-width:640px;">
              <tr>
                <td align="center" style="background:#102447;padding:22px 24px 24px 24px;">
                  <div style="color:#b9c8df;font-family:Arial,sans-serif;font-size:9px;font-weight:bold;letter-spacing:.7px;line-height:12px;text-transform:uppercase;">SilverSurfers AI &nbsp;&middot;&nbsp; ${escapeHtml(options.eyebrowRight)}</div>
                  <div style="color:#ffffff;font-family:Arial,sans-serif;font-size:24px;font-weight:bold;line-height:30px;margin-top:5px;">${escapeHtml(options.heading)}</div>
                  <div style="color:#dbe5f3;font-family:Arial,sans-serif;font-size:12px;line-height:16px;margin-top:3px;">${escapeHtml(displayDomain(options.domain))} &nbsp;-&nbsp; ${escapeHtml(generatedDate)}</div>
                </td>
              </tr>
              ${statsHtml}
              <tr>
                <td style="font-family:Arial,sans-serif;color:#111827;font-size:16px;line-height:21px;padding:26px 0 14px 0;">
                  ${options.intro}
                </td>
              </tr>
              <tr>
                <td>
                  ${bodyParagraphsHtml}
                  ${bulletsHtml}
                  ${actionHtml}
                </td>
              </tr>
              <tr>
                <td style="border-top:1px solid #d7dde8;font-family:Arial,sans-serif;padding:24px 0 20px 0;">
                  <div style="color:#4b5563;font-size:13px;line-height:18px;">${options.footerNote}</div>
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
    displayDomain(options.domain),
    '',
    ...(options.stats || []).map((stat) => `${stat.label}: ${stat.value}`),
    '',
    stripHtml(options.intro),
    '',
    ...(options.bodyLines || []).map(stripHtml),
    ...(options.bullets || []).map((item) => `- ${stripHtml(item)}`),
    ...(options.actionLabel && options.actionUrl ? ['', `${options.actionLabel}: ${options.actionUrl}`] : []),
    '',
    stripHtml(options.footerNote),
    '',
    "This email was generated automatically - please don't reply directly.",
    'Questions? Reach our team at hello@silversurfers.ai.',
  ]
    .filter((line, index, lines) => !(line === '' && lines[index - 1] === ''))
    .join('\n');

  return { html, text };
}

function stripHtml(value: string): string {
  return String(value ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
}

export function buildRunCompleteEmailContent(options: {
  domain: string;
  succeeded: boolean;
  score?: number;
  scoreDelta?: number;
  issueCount?: number;
  errorMessage?: string;
  reportUrl: string;
}): { subject: string; content: MonitoringEmailContent } {
  const domain = displayDomain(options.domain);

  if (!options.succeeded) {
    const subject = `Scheduled Scan Failed for ${domain}`;
    return {
      subject,
      content: wrapMonitoringEmail({
        subject,
        preheader: `Your scheduled SilverSurfers scan for ${domain} could not complete.`,
        eyebrowRight: 'Monitoring Update',
        heading: 'Scheduled Audit Failed',
        domain: options.domain,
        intro: `The scheduled audit for <strong>${escapeHtml(domain)}</strong> did not complete.`,
        bodyLines: [
          options.errorMessage
            ? `The scan failed with the following error: ${escapeHtml(options.errorMessage)}`
            : 'The scan failed for an unknown reason. Please check that the domain is reachable and try again.',
        ],
        footerNote: 'You are receiving this because monitoring is enabled for this domain. You can adjust notification settings from your account.',
      }),
    };
  }

  const deltaLine = typeof options.scoreDelta === 'number'
    ? (options.scoreDelta === 0
      ? 'No change since the last run.'
      : `${options.scoreDelta > 0 ? 'Up' : 'Down'} ${Math.abs(options.scoreDelta)} point(s) since the last run.`)
    : 'This is the first recorded run for this monitor.';

  const subject = `Your SilverSurfers Monitoring Report for ${domain}`;
  return {
    subject,
    content: wrapMonitoringEmail({
      subject,
      preheader: `Your Silver Score for ${domain} is ${options.score ?? 'N/A'}. ${deltaLine}`,
      eyebrowRight: 'Monitoring Update',
      heading: 'Scheduled Audit Complete',
      domain: options.domain,
      intro: `Your Silver Score&trade; for <strong>${escapeHtml(domain)}</strong> is <strong>${options.score ?? 'N/A'}</strong>.`,
      stats: [
        { label: 'Silver Score', value: String(options.score ?? '—') },
        { label: 'Change', value: deltaLine === 'This is the first recorded run for this monitor.' ? 'First run' : deltaLine.replace(' since the last run.', '') },
        { label: 'Issues Found', value: typeof options.issueCount === 'number' ? String(options.issueCount) : '—' },
      ],
      actionLabel: 'View Full Report',
      actionUrl: options.reportUrl,
      footerNote: 'You are receiving this because monitoring is enabled for this domain. You can adjust notification settings from your account.',
    }),
  };
}

export function buildScoreDropEmailContent(options: {
  domain: string;
  score: number;
  previousScore?: number;
  scoreDelta?: number;
  alertThreshold: number;
  reportUrl: string;
}): { subject: string; content: MonitoringEmailContent } {
  const domain = displayDomain(options.domain);
  const subject = `Silver Score Alert for ${domain}`;
  return {
    subject,
    content: wrapMonitoringEmail({
      subject,
      preheader: `${domain} dropped to ${options.score}, below your alert threshold of ${options.alertThreshold}.`,
      eyebrowRight: 'Score Alert',
      heading: 'Silver Score Alert',
      domain: options.domain,
      intro: `<strong>${escapeHtml(domain)}</strong> dropped below your alert threshold.`,
      stats: [
        { label: 'Current Score', value: String(options.score) },
        { label: 'Previous Score', value: typeof options.previousScore === 'number' ? String(options.previousScore) : '—' },
        { label: 'Alert Threshold', value: String(options.alertThreshold) },
      ],
      bodyLines: [
        typeof options.scoreDelta === 'number' ? `Change: <strong>${options.scoreDelta}</strong> point(s).` : '',
      ].filter(Boolean),
      actionLabel: 'View Full Report',
      actionUrl: options.reportUrl,
      footerNote: 'You are receiving this because an alert threshold is set for this monitoring job. You can adjust or disable it from your account.',
    }),
  };
}

export function buildNewIssuesEmailContent(options: {
  domain: string;
  newIssueCount: number;
  topIssues: MonitoringIssueLike[];
  reportUrl: string;
}): { subject: string; content: MonitoringEmailContent } {
  const domain = displayDomain(options.domain);
  const subject = `New Accessibility Issues Found on ${domain}`;
  return {
    subject,
    content: wrapMonitoringEmail({
      subject,
      preheader: `${options.newIssueCount} new accessibility issue(s) found on ${domain} since the last scan.`,
      eyebrowRight: 'New Issues',
      heading: 'New Issues Detected',
      domain: options.domain,
      intro: `<strong>${options.newIssueCount}</strong> new issue${options.newIssueCount === 1 ? '' : 's'} found on <strong>${escapeHtml(domain)}</strong>.`,
      bodyLines: ['These issues were not present in the previous monitoring run:'],
      bullets: options.topIssues.slice(0, 3).map((issue) => {
        const title = escapeHtml(issue.title || 'Untitled issue');
        return issue.severity ? `${title} (${escapeHtml(issue.severity)})` : title;
      }),
      actionLabel: 'View Full Report',
      actionUrl: options.reportUrl,
      footerNote: 'You are receiving this because new-issue alerts are enabled for this monitoring job. You can adjust notification settings from your account.',
    }),
  };
}
