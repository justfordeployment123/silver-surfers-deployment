import { logger } from '../../config/logger.ts';
import { sendDirectMail } from '../audits/report-delivery.ts';
import { getUserModel } from '../audits/audits.dependencies.ts';
import { getNotificationLogModel, type MonitoringJobDocument, type MonitoringRunDocument, type NotificationType } from './monitoring.dependencies.ts';
import { buildNewIssuesEmailContent, buildReportUrl, buildRunCompleteEmailContent, buildScoreDropEmailContent } from './monitoring-email.service.ts';

const notificationsLogger = logger.child('feature:monitoring:notifications');

interface NotificationIssueLike {
  title?: string;
  severity?: string;
}

async function resolveRecipients(job: Pick<MonitoringJobDocument, 'userId' | 'alertEmails'>): Promise<string[]> {
  if (job.alertEmails && job.alertEmails.length > 0) {
    return job.alertEmails;
  }

  if (!job.userId) return [];
  const User = await getUserModel();
  const user = await User.findById(job.userId).lean() as { email?: string } | null;
  return user?.email ? [user.email] : [];
}

async function sendAndLog(params: {
  jobId: string;
  runId: string;
  userId: string;
  type: NotificationType;
  recipients: string[];
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const NotificationLog = await getNotificationLogModel();
  const logCtx = { jobId: params.jobId, runId: params.runId, type: params.type, recipients: params.recipients };

  if (params.recipients.length === 0) {
    notificationsLogger.warn('Skipping notification — no recipients resolved.', logCtx);
    await NotificationLog.create({
      jobId: params.jobId, runId: params.runId, userId: params.userId, type: params.type,
      recipients: [], subject: params.subject, status: 'failed', errorMessage: 'No recipients resolved.',
    }).catch((error) => {
      notificationsLogger.error('Failed to write NotificationLog entry for a no-recipients skip.', {
        ...logCtx, error: error instanceof Error ? error.message : String(error),
      });
    });
    return;
  }

  notificationsLogger.debug('Sending monitoring notification email.', logCtx);

  try {
    const result = await sendDirectMail({
      to: params.recipients.join(', '),
      subject: params.subject,
      html: params.html,
      text: params.text,
    });

    if (result.success) {
      notificationsLogger.info('Monitoring notification sent.', { ...logCtx, messageId: result.messageId });
    } else {
      notificationsLogger.error('Monitoring notification failed to send.', { ...logCtx, error: result.error });
    }

    await NotificationLog.create({
      jobId: params.jobId, runId: params.runId, userId: params.userId, type: params.type,
      recipients: params.recipients, subject: params.subject,
      status: result.success ? 'sent' : 'failed',
      errorMessage: result.success ? undefined : result.error,
      messageId: result.messageId,
      sentAt: new Date(),
    });
  } catch (error) {
    // sendDirectMail itself is designed not to throw (it returns
    // {success:false} on failure), but guard anyway — a notification
    // failure must never propagate and break the reconcile pass that
    // triggered it.
    const message = error instanceof Error ? error.message : String(error);
    notificationsLogger.error('Unexpected error while sending monitoring notification.', { ...logCtx, error: message });
    await NotificationLog.create({
      jobId: params.jobId, runId: params.runId, userId: params.userId, type: params.type,
      recipients: params.recipients, subject: params.subject, status: 'failed', errorMessage: message,
    }).catch(() => {
      notificationsLogger.error('Failed to write NotificationLog entry after a send exception.', logCtx);
    });
  }
}

/**
 * Evaluates and sends the three alert types from 2.2.6.4 for a just-resolved
 * MonitoringRun. Called from the reconcile pass in monitoring.engine.ts.
 * Every send is independently try/caught and logged — a failure in one
 * notification (or all three) must never affect run resolution, which has
 * already been persisted by the time this runs.
 */
export async function evaluateAndSendRunNotifications(params: {
  job: MonitoringJobDocument;
  run: MonitoringRunDocument;
  previousScore?: number;
  newIssues: NotificationIssueLike[];
}): Promise<void> {
  const { job, run, previousScore, newIssues } = params;
  const jobId = String(job._id);
  const runId = String(run._id);
  const logCtx = { jobId, runId, domain: job.domain, runStatus: run.status };

  notificationsLogger.debug('Evaluating alert conditions for resolved run.', {
    ...logCtx, score: run.score, scoreDelta: run.scoreDelta, newIssueCount: run.newIssueCount,
    alertThreshold: job.alertThreshold, notifyOnComplete: job.notifyOnComplete, notifyOnNewIssues: job.notifyOnNewIssues,
  });

  const recipients = await resolveRecipients(job);
  const reportUrl = buildReportUrl(run.auditModel === 'QuickScan' ? 'QuickScan' : 'AnalysisRecord', { auditId: run.auditId });

  // 1. Run-complete notification — always, unless explicitly disabled.
  if (job.notifyOnComplete !== false) {
    const { subject, content } = buildRunCompleteEmailContent({
      domain: job.domain || 'your domain',
      succeeded: run.status === 'complete',
      score: run.score,
      scoreDelta: run.scoreDelta,
      issueCount: run.issueCount,
      errorMessage: run.errorMessage,
      reportUrl,
    });
    await sendAndLog({ jobId, runId, userId: String(job.userId), type: 'run_complete', recipients, subject, html: content.html, text: content.text });
  } else {
    notificationsLogger.debug('Run-complete notification disabled for this job — skipping.', logCtx);
  }

  if (run.status !== 'complete') {
    notificationsLogger.debug('Run did not succeed — skipping score-drop and new-issues checks (nothing to evaluate).', logCtx);
    return;
  }

  // 2. Score-drop alert — only if a threshold is configured, the score is
  // below it, AND the score moved in the wrong direction this run.
  if (typeof job.alertThreshold === 'number' && typeof run.score === 'number') {
    const droppedBelowThreshold = run.score < job.alertThreshold;
    const movedDown = typeof run.scoreDelta === 'number' && run.scoreDelta < 0;

    if (droppedBelowThreshold && movedDown) {
      const { subject, content } = buildScoreDropEmailContent({
        domain: job.domain || 'your domain', score: run.score, previousScore, scoreDelta: run.scoreDelta,
        alertThreshold: job.alertThreshold, reportUrl,
      });
      await sendAndLog({ jobId, runId, userId: String(job.userId), type: 'score_drop', recipients, subject, html: content.html, text: content.text });
    } else {
      notificationsLogger.debug('Score-drop conditions not met — skipping.', { ...logCtx, droppedBelowThreshold, movedDown });
    }
  }

  // 3. New-issues alert — only if enabled and there's at least one new issue.
  if (job.notifyOnNewIssues !== false && (run.newIssueCount ?? 0) > 0) {
    const { subject, content } = buildNewIssuesEmailContent({
      domain: job.domain || 'your domain', newIssueCount: run.newIssueCount ?? 0, topIssues: newIssues, reportUrl,
    });
    await sendAndLog({ jobId, runId, userId: String(job.userId), type: 'new_issues', recipients, subject, html: content.html, text: content.text });
  } else {
    notificationsLogger.debug('New-issues conditions not met or disabled — skipping.', {
      ...logCtx, notifyOnNewIssues: job.notifyOnNewIssues, newIssueCount: run.newIssueCount,
    });
  }
}
