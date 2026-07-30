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

// Same table-free, template-literal wrapper style as
// billing-email.service.ts's wrapBillingEmail — kept consistent rather than
// introducing a third HTML-building convention into the codebase.
function wrapMonitoringEmail(options: {
  bannerTitle: string;
  heading: string;
  intro: string;
  bodyLines?: string[];
  bullets?: string[];
  actionLabel?: string;
  actionUrl?: string;
  footer: string;
  accentColor: string;
  subject: string;
}): MonitoringEmailContent {
  const bulletList = options.bullets && options.bullets.length > 0
    ? `<ul style="margin:0 0 20px 0;padding-left:20px;color:#374151;">${options.bullets.map((item) => `<li>${item}</li>`).join('')}</ul>`
    : '';

  const action = options.actionLabel && options.actionUrl
    ? `
      <p style="margin:20px 0;">
        <a href="${options.actionUrl}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold">${options.actionLabel}</a>
      </p>
      <p style="margin:16px 0;color:#6b7280;font-size:14px;">${options.actionUrl}</p>
    `
    : '';

  const bodyParagraphs = (options.bodyLines || [])
    .map((line) => `<p style="margin:0 0 16px 0;line-height:1.6;color:#374151;">${line}</p>`)
    .join('');

  const html = `
    <div style="font-family: Arial,sans-serif;background:#f7f7fb;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <div style="padding:20px 24px;border-bottom:1px solid #eef2f7;background:${options.accentColor};color:#fff;">
          <h1 style="margin:0;font-size:20px;">${options.bannerTitle}</h1>
        </div>
        <div style="padding:24px;color:#111827;">
          <h2 style="margin:0 0 8px 0;font-size:18px;">${options.heading}</h2>
          <p style="margin:0 0 16px 0;line-height:1.6;color:#374151;">${options.intro}</p>
          ${bodyParagraphs}
          ${bulletList}
          ${action}
          <p style="margin:0;font-size:12px;color:#9ca3af;">${options.footer}</p>
        </div>
        <div style="padding:16px 24px;border-top:1px solid #eef2f7;color:#6b7280;font-size:12px;">SilverSurfers • Accessibility for Everyone</div>
      </div>
    </div>`;

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
  ]
    .filter((line, index, lines) => !(line === '' && lines[index - 1] === ''))
    .join('\n');

  return { html, text };
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
  const subject = options.succeeded
    ? `SilverSurfers.ai — Audit complete for ${options.domain}`
    : `SilverSurfers.ai — Scheduled audit failed for ${options.domain}`;

  if (!options.succeeded) {
    return {
      subject,
      content: wrapMonitoringEmail({
        subject,
        bannerTitle: 'Scheduled Audit Failed',
        accentColor: '#C84B2F',
        heading: `The scheduled audit for ${options.domain} did not complete.`,
        intro: options.errorMessage
          ? `The scan failed with the following error: ${options.errorMessage}`
          : 'The scan failed for an unknown reason. Please check the domain is reachable and try again.',
        footer: 'You are receiving this because monitoring is enabled for this domain. You can adjust notification settings from your account.',
      }),
    };
  }

  const deltaLine = typeof options.scoreDelta === 'number'
    ? (options.scoreDelta === 0
      ? 'No change since the last run.'
      : `${options.scoreDelta > 0 ? 'Up' : 'Down'} ${Math.abs(options.scoreDelta)} point(s) since the last run.`)
    : 'This is the first recorded run for this monitor.';

  return {
    subject,
    content: wrapMonitoringEmail({
      subject,
      bannerTitle: 'Scheduled Audit Complete',
      accentColor: '#1D9E75',
      heading: `Your Silver Score™ for ${options.domain} is ${options.score ?? 'N/A'}.`,
      intro: deltaLine,
      bodyLines: [
        typeof options.issueCount === 'number' ? `Total issues found: <strong>${options.issueCount}</strong>` : '',
      ].filter(Boolean),
      actionLabel: 'View Full Report',
      actionUrl: options.reportUrl,
      footer: 'You are receiving this because monitoring is enabled for this domain. You can adjust notification settings from your account.',
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
  const subject = `Action Required — Silver Score™ dropped for ${options.domain}`;
  return {
    subject,
    content: wrapMonitoringEmail({
      subject,
      bannerTitle: 'Silver Score™ Alert',
      accentColor: '#C84B2F',
      heading: `${options.domain} dropped below your alert threshold.`,
      intro: `The current score is <strong>${options.score}</strong>, below your alert threshold of <strong>${options.alertThreshold}</strong>.`,
      bodyLines: [
        typeof options.previousScore === 'number' ? `Previous score: <strong>${options.previousScore}</strong>` : '',
        typeof options.scoreDelta === 'number' ? `Change: <strong>${options.scoreDelta}</strong> point(s)` : '',
      ].filter(Boolean),
      actionLabel: 'View Full Report',
      actionUrl: options.reportUrl,
      footer: 'You are receiving this because an alert threshold is set for this monitoring job. You can adjust or disable it from your account.',
    }),
  };
}

export function buildNewIssuesEmailContent(options: {
  domain: string;
  newIssueCount: number;
  topIssues: MonitoringIssueLike[];
  reportUrl: string;
}): { subject: string; content: MonitoringEmailContent } {
  const subject = `New accessibility issues found on ${options.domain}`;
  return {
    subject,
    content: wrapMonitoringEmail({
      subject,
      bannerTitle: 'New Issues Detected',
      accentColor: '#B06A10',
      heading: `${options.newIssueCount} new issue(s) found on ${options.domain}.`,
      intro: 'These issues were not present in the previous monitoring run.',
      bullets: options.topIssues.slice(0, 3).map((issue) => `${issue.title || 'Untitled issue'}${issue.severity ? ` (${issue.severity})` : ''}`),
      actionLabel: 'View Full Report',
      actionUrl: options.reportUrl,
      footer: 'You are receiving this because new-issue alerts are enabled for this monitoring job. You can adjust notification settings from your account.',
    }),
  };
}
