import { logger } from '../../config/logger.ts';
import { getAuditQueues } from '../audits/audits.runtime.ts';
import { getAnalysisRecordModel, getQuickScanModel, getUserModel } from '../audits/audits.dependencies.ts';
import { getMonitoringJobModel, getMonitoringRunModel } from './monitoring.dependencies.ts';
import { computeNextRunAt, InvalidCronExpressionError } from './monitoring.schedule.ts';
import { validateMonitoringJobAgainstPlanLimits } from './monitoring.plan-limits.ts';
import { evaluateAndSendRunNotifications } from './monitoring-notifications.ts';

const monitoringLogger = logger.child('feature:monitoring');

function createTaskId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface AuditIssueLike {
  auditId?: string;
  title?: string;
  severity?: string;
}

function extractIssues(scoreCard: { issues?: AuditIssueLike[] } | undefined | null): AuditIssueLike[] {
  return scoreCard?.issues ?? [];
}

function extractIssueIds(scoreCard: { issues?: AuditIssueLike[] } | undefined | null): Set<string> {
  return new Set(extractIssues(scoreCard).map((issue) => issue.auditId).filter((id): id is string => Boolean(id)));
}

export interface DispatchJobResult {
  dispatched: boolean;
  runId?: string;
  auditId?: string;
  /** Set when dispatched=false: why (in-flight run, plan-limit rejection, or error). */
  reason?: string;
}

/**
 * Dispatches a single MonitoringJob right now, regardless of its nextRunAt —
 * shared by the scheduled dispatch pass (2.2.6.2) below and the manual
 * "trigger now" API endpoint (2.2.6.5), so both go through identical
 * duplicate-run guarding, plan-limit re-validation (2.2.6.3), record
 * creation, and queue enqueue logic rather than maintaining two versions.
 *
 * Deliberately does NOT thread monitoringRunId through the queue job payload
 * as the primary linkage — that payload survives inconsistently across the
 * BullMQ vs PersistentQueue backends and across the crash-recovery / SQS
 * scanner-callback code paths (verified against the actual processor code).
 * Instead MonitoringRun.auditId is set at creation time, before enqueueing,
 * so reconciliation (below) can always find its way back regardless of which
 * path the scan takes to complete. The extra fields are still included on
 * the job payload as non-load-bearing debugging context.
 */
export async function dispatchMonitoringJob(jobId: string): Promise<DispatchJobResult> {
  const [MonitoringJob, MonitoringRun, AnalysisRecord, QuickScan, User] = await Promise.all([
    getMonitoringJobModel(),
    getMonitoringRunModel(),
    getAnalysisRecordModel(),
    getQuickScanModel(),
    getUserModel(),
  ]);

  const job = await MonitoringJob.findById(jobId);
  if (!job) {
    monitoringLogger.error('Cannot dispatch — job not found.', { jobId });
    return { dispatched: false, reason: 'Monitoring job not found.' };
  }

  const logCtx = { jobId, userId: String(job.userId), domain: job.domain, scanType: job.scanType, schedule: job.schedule };
  monitoringLogger.debug('Evaluating job for dispatch.', logCtx);

  try {
    // Duplicate-enqueue guard: skip if a run is already in flight for this job.
    const inFlight = await MonitoringRun.findOne({ jobId: job._id, status: { $in: ['pending', 'running'] } });
    if (inFlight) {
      monitoringLogger.warn('Skipping dispatch — a run is already in flight for this job.', {
        ...logCtx, inFlightRunId: String(inFlight._id), inFlightRunStatus: inFlight.status,
      });
      return { dispatched: false, reason: `A run is already in progress (started ${inFlight.triggeredAt?.toISOString?.() || ''}).` };
    }

    // Defensive re-check (2.2.6.3): the user's plan may have changed since
    // this job was created (e.g. downgrade). Re-validate on every dispatch
    // rather than only at job-creation time.
    const activeJobCount = await MonitoringJob.countDocuments({
      userId: job.userId, status: 'active', _id: { $ne: job._id },
    });
    const limitCheck = await validateMonitoringJobAgainstPlanLimits(
      String(job.userId), { scanType: job.scanType as 'quick' | 'full', schedule: job.schedule, customCronExpression: job.customCronExpression },
      activeJobCount,
    );
    if (!limitCheck.allowed) {
      job.status = 'error';
      await job.save();
      monitoringLogger.error('Job no longer within plan limits — marked as error and will not be retried until fixed.', {
        ...logCtx, reason: limitCheck.reason,
      });
      return { dispatched: false, reason: limitCheck.reason };
    }

    const user = job.userId ? await User.findById(job.userId) : null;
    const email = (user as { email?: string } | null)?.email;
    if (!email) {
      throw new Error(`No user/email found for MonitoringJob ${jobId} (userId ${String(job.userId)}).`);
    }
    const firstName = (user as { firstName?: string } | null)?.firstName || '';
    const lastName = (user as { lastName?: string } | null)?.lastName || '';
    const taskId = createTaskId();
    const device = job.devicesEnabled?.[0] || 'desktop';
    const { fullAuditQueue, quickScanQueue } = getAuditQueues();
    const now = new Date();

    let auditId: string;
    let auditModel: 'AnalysisRecord' | 'QuickScan';

    if (job.scanType === 'full') {
      const record = await AnalysisRecord.create({
        user: job.userId,
        email,
        firstName,
        lastName,
        url: job.domain,
        taskId,
        planId: 'monitoring',
        device,
        status: 'queued',
        emailStatus: 'pending',
      });
      auditId = String(record._id);
      auditModel = 'AnalysisRecord';
      monitoringLogger.debug('Created AnalysisRecord for monitoring run.', { ...logCtx, auditId, taskId });

      await fullAuditQueue.addJob({
        email, url: job.domain, firstName, lastName, userId: job.userId, taskId,
        jobType: 'full-audit', subscriptionId: null, planId: 'monitoring', selectedDevice: device,
        priority: 3, recordId: record._id,
        // Non-load-bearing context — see function doc comment above.
        monitoringJobId: jobId, monitoringRunId: null,
      });
      monitoringLogger.debug('Enqueued full-audit job on fullAuditQueue.', { ...logCtx, auditId, taskId });
    } else {
      const record = await QuickScan.create({
        url: job.domain, email, firstName, lastName, device, status: 'queued',
        emailStatus: 'pending', scanDate: now,
      });
      auditId = String(record._id);
      auditModel = 'QuickScan';
      monitoringLogger.debug('Created QuickScan for monitoring run.', { ...logCtx, auditId, taskId });

      await quickScanQueue.addJob({
        email, url: job.domain, firstName, lastName, userId: job.userId, taskId,
        jobType: 'quick-scan', subscriptionId: null, priority: 3, quickScanId: record._id,
        selectedDevice: device,
        monitoringJobId: jobId, monitoringRunId: null,
      });
      monitoringLogger.debug('Enqueued quick-scan job on quickScanQueue.', { ...logCtx, auditId, taskId });
    }

    const run = await MonitoringRun.create({
      jobId: job._id, userId: job.userId, auditId, auditModel,
      triggeredAt: now, status: 'pending',
    });

    const previousNextRunAt = job.nextRunAt;
    job.nextRunAt = computeNextRunAt(job, now);
    await job.save();

    monitoringLogger.info('Dispatched a monitoring run.', {
      ...logCtx, runId: String(run._id), auditId, taskId,
      previousNextRunAt: previousNextRunAt?.toISOString(), nextRunAt: job.nextRunAt.toISOString(),
    });

    return { dispatched: true, runId: String(run._id), auditId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    monitoringLogger.error('Failed to dispatch monitoring job.', { ...logCtx, error: message });

    // A job whose cron config can't be parsed will loop forever without
    // this — flip it to 'error' so it stops being picked up as "due".
    if (error instanceof InvalidCronExpressionError) {
      await MonitoringJob.updateOne({ _id: job._id }, { $set: { status: 'error' } }).catch((updateError) => {
        monitoringLogger.error('Failed to mark job as error after invalid cron expression.', {
          ...logCtx, error: updateError instanceof Error ? updateError.message : String(updateError),
        });
      });
      monitoringLogger.error('Marked job as error due to invalid cron expression.', logCtx);
    }

    return { dispatched: false, reason: message };
  }
}

/**
 * Scheduled dispatch pass (2.2.6.2) — finds all MonitoringJobs due to run
 * (status active, nextRunAt <= now) and dispatches each via
 * dispatchMonitoringJob.
 */
export async function runMonitoringDispatchPass(): Promise<{ dispatched: number; skipped: number; errors: number }> {
  const passStartedAt = Date.now();
  monitoringLogger.info('Dispatch pass starting.');

  const MonitoringJob = await getMonitoringJobModel();
  const now = new Date();
  const dueJobs = await MonitoringJob.find({ status: 'active', nextRunAt: { $lte: now } }).limit(50);

  monitoringLogger.info('Dispatch pass found due jobs.', { dueJobCount: dueJobs.length, asOf: now.toISOString() });

  let dispatched = 0;
  let skipped = 0;
  let errors = 0;

  for (const job of dueJobs) {
    const result = await dispatchMonitoringJob(String(job._id));
    if (result.dispatched) {
      dispatched += 1;
    } else if (result.reason?.includes('already in progress')) {
      skipped += 1;
    } else {
      errors += 1;
    }
  }

  const durationMs = Date.now() - passStartedAt;
  monitoringLogger.info('Dispatch pass complete.', { dispatched, skipped, errors, dueJobCount: dueJobs.length, durationMs });

  return { dispatched, skipped, errors };
}

interface TerminalRecordState {
  isTerminal: boolean;
  succeeded: boolean;
  score?: number | null;
  errorMessage?: string;
  scoreCard?: { issues?: AuditIssueLike[] } | null;
}

function readAnalysisRecordState(record: {
  status?: string; score?: number | null; failureReason?: string; scoreCard?: unknown;
} | null): TerminalRecordState {
  if (!record) return { isTerminal: false, succeeded: false };
  const terminalStatuses = ['completed', 'completed_with_warnings', 'failed'];
  return {
    isTerminal: terminalStatuses.includes(record.status || ''),
    succeeded: record.status === 'completed' || record.status === 'completed_with_warnings',
    score: record.score,
    errorMessage: record.failureReason,
    scoreCard: record.scoreCard as { issues?: AuditIssueLike[] } | null,
  };
}

function readQuickScanState(record: {
  status?: string; scanScore?: number | null; errorMessage?: string; scoreCard?: unknown;
} | null): TerminalRecordState {
  if (!record) return { isTerminal: false, succeeded: false };
  return {
    isTerminal: record.status === 'completed' || record.status === 'failed',
    succeeded: record.status === 'completed',
    score: record.scanScore,
    errorMessage: record.errorMessage,
    scoreCard: record.scoreCard as { issues?: AuditIssueLike[] } | null,
  };
}

/**
 * Reconcile pass — resolves in-flight MonitoringRuns by checking whether the
 * scan record they point at (AnalysisRecord/QuickScan) has reached a
 * terminal state, rather than hooking into the audit processors' completion
 * code directly. See the architecture note in the dispatch pass doc comment
 * above for why: the processors have 4-6 independent success/failure sites
 * across sync and async (SQS scanner-callback) paths, and hooking all of
 * them for one field is a much larger, riskier change than polling the
 * record state we already own the reference to.
 */
export async function runMonitoringReconcilePass(): Promise<{ resolved: number; stillPending: number; errors: number }> {
  const passStartedAt = Date.now();
  monitoringLogger.info('Reconcile pass starting.');

  const [MonitoringJob, MonitoringRun, AnalysisRecord, QuickScan] = await Promise.all([
    getMonitoringJobModel(),
    getMonitoringRunModel(),
    getAnalysisRecordModel(),
    getQuickScanModel(),
  ]);

  const inFlightRuns = await MonitoringRun.find({ status: { $in: ['pending', 'running'] } }).limit(100);
  monitoringLogger.info('Reconcile pass found in-flight runs.', { inFlightCount: inFlightRuns.length });

  let resolved = 0;
  let stillPending = 0;
  let errors = 0;

  for (const run of inFlightRuns) {
    const runId = String(run._id);
    const logCtx = { runId, jobId: String(run.jobId), auditId: run.auditId ? String(run.auditId) : undefined, auditModel: run.auditModel };

    try {
      if (!run.auditId) {
        monitoringLogger.warn('In-flight run has no auditId — cannot reconcile, leaving as-is.', logCtx);
        stillPending += 1;
        continue;
      }

      const state = run.auditModel === 'QuickScan'
        ? readQuickScanState(await QuickScan.findById(run.auditId))
        : readAnalysisRecordState(await AnalysisRecord.findById(run.auditId));

      if (!state.isTerminal) {
        monitoringLogger.debug('Run not yet terminal — will check again next pass.', logCtx);
        stillPending += 1;
        continue;
      }

      monitoringLogger.debug('Run reached terminal state.', { ...logCtx, succeeded: state.succeeded, score: state.score });

      const previousRun = await MonitoringRun.findOne({
        jobId: run.jobId, status: 'complete', _id: { $ne: run._id },
      }).sort({ triggeredAt: -1 });

      const currentIssueIds = extractIssueIds(state.scoreCard);
      const currentIssues = extractIssues(state.scoreCard);
      let newIssueCount: number | undefined;
      let resolvedIssueCount: number | undefined;
      let scoreDelta: number | undefined;
      let newIssues: AuditIssueLike[] = [];
      let previousScore: number | undefined;

      if (previousRun?.auditId) {
        const previousState = previousRun.auditModel === 'QuickScan'
          ? readQuickScanState(await QuickScan.findById(previousRun.auditId))
          : readAnalysisRecordState(await AnalysisRecord.findById(previousRun.auditId));
        const previousIssueIds = extractIssueIds(previousState.scoreCard);

        newIssues = currentIssues.filter((issue) => issue.auditId && !previousIssueIds.has(issue.auditId));
        newIssueCount = newIssues.length;
        resolvedIssueCount = [...previousIssueIds].filter((id) => !currentIssueIds.has(id)).length;
        previousScore = typeof previousState.score === 'number' ? previousState.score : undefined;
        if (typeof state.score === 'number' && typeof previousState.score === 'number') {
          scoreDelta = state.score - previousState.score;
        }
        monitoringLogger.debug('Computed diff against previous run.', {
          ...logCtx, previousRunId: String(previousRun._id), newIssueCount, resolvedIssueCount, scoreDelta,
        });
      } else {
        monitoringLogger.debug('No previous completed run for this job — this is the first resolved run.', logCtx);
      }

      run.completedAt = new Date();
      run.status = state.succeeded ? 'complete' : 'failed';
      run.score = state.score ?? undefined;
      run.scoreDelta = scoreDelta;
      run.issueCount = currentIssueIds.size;
      run.newIssueCount = newIssueCount;
      run.resolvedIssueCount = resolvedIssueCount;
      if (!state.succeeded) run.errorMessage = state.errorMessage;
      await run.save();

      const job = await MonitoringJob.findById(run.jobId);
      if (job) {
        job.lastRunAt = run.completedAt;
        if (state.succeeded) job.lastRunScore = state.score ?? undefined;
        await job.save();
      } else {
        monitoringLogger.warn('Resolved a run but its parent MonitoringJob no longer exists — skipping job update and notifications.', logCtx);
      }

      resolved += 1;
      if (state.succeeded) {
        monitoringLogger.info('Resolved a monitoring run — succeeded.', {
          ...logCtx, score: state.score, scoreDelta, issueCount: run.issueCount, newIssueCount, resolvedIssueCount,
        });
      } else {
        monitoringLogger.error('Resolved a monitoring run — the scan itself failed.', {
          ...logCtx, errorMessage: state.errorMessage,
        });
      }

      // Notifications are fully decoupled from run-resolution success: a
      // failure here must never undo the fact that the run itself was
      // already resolved and persisted above.
      if (job) {
        try {
          await evaluateAndSendRunNotifications({ job, run, previousScore, newIssues });
        } catch (notifyError) {
          monitoringLogger.error('Notification evaluation threw unexpectedly — run resolution is unaffected.', {
            ...logCtx, error: notifyError instanceof Error ? notifyError.message : String(notifyError),
          });
        }
      }
    } catch (error) {
      errors += 1;
      const message = error instanceof Error ? error.message : String(error);
      monitoringLogger.error('Failed to reconcile monitoring run.', { ...logCtx, error: message });
    }
  }

  const durationMs = Date.now() - passStartedAt;
  monitoringLogger.info('Reconcile pass complete.', { resolved, stillPending, errors, inFlightCount: inFlightRuns.length, durationMs });

  return { resolved, stillPending, errors };
}

export async function runMonitoringSchedulePass(): Promise<void> {
  const passStartedAt = Date.now();
  monitoringLogger.info('Monitoring schedule pass starting.');

  const dispatch = await runMonitoringDispatchPass().catch((error) => {
    monitoringLogger.error('Dispatch pass threw unexpectedly — continuing to reconcile pass regardless.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { dispatched: 0, skipped: 0, errors: 1 };
  });
  const reconcile = await runMonitoringReconcilePass().catch((error) => {
    monitoringLogger.error('Reconcile pass threw unexpectedly.', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { resolved: 0, stillPending: 0, errors: 1 };
  });

  const durationMs = Date.now() - passStartedAt;
  monitoringLogger.info('Monitoring schedule pass complete.', { ...dispatch, ...reconcile, durationMs });
}
