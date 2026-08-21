import { Router } from 'express';

import { logger } from '../../config/logger.ts';
import { asyncHandler } from '../../shared/http/async-handler.ts';
import { adminRequired } from '../auth/admin.middleware.ts';
import { authRequired } from '../auth/auth.middleware.ts';
import { getMonitoringJobModel, getMonitoringRunModel, getNotificationLogModel, type MonitoringDevice, type MonitoringRunDocument, type MonitoringScanType, type MonitoringSchedule } from './monitoring.dependencies.ts';
import { computeNextRunAt, describeCronExpression, InvalidCronExpressionError } from './monitoring.schedule.ts';
import { MONITORING_PLAN_LIMITS, resolveMonitoringPlanId, validateMonitoringJobAgainstPlanLimits } from './monitoring.plan-limits.ts';
import { dispatchMonitoringJob } from './monitoring.engine.ts';
import { getAnalysisRecordModel } from '../audits/audits.dependencies.ts';

/**
 * The dashboard's report link needs a frontend route path, but AnalysisRecord
 * is addressed by its `taskId` field (not `_id`) while QuickScan is addressed
 * by `_id` — MonitoringRun only stores the linked record's `_id` via
 * `auditId`. Resolve the taskId lookup here, server-side, once, rather than
 * leaking this AnalysisRecord-specific quirk into the frontend.
 */
async function attachReportPaths(runs: MonitoringRunDocument[]): Promise<Array<MonitoringRunDocument & { reportPath?: string }>> {
  const analysisIds = runs.filter((r) => r.auditModel === 'AnalysisRecord' && r.auditId).map((r) => r.auditId);
  const taskIdById = new Map<string, string>();

  if (analysisIds.length > 0) {
    try {
      const AnalysisRecord = await getAnalysisRecordModel();
      const records = await AnalysisRecord.find({ _id: { $in: analysisIds } }, { taskId: 1 }).lean();
      for (const record of records as Array<{ _id: unknown; taskId?: string }>) {
        if (record.taskId) taskIdById.set(String(record._id), record.taskId);
      }
    } catch (error) {
      // Never let a report-link lookup failure break the runs list itself —
      // worst case the UI just shows no "View Report" link for this batch.
      routesLogger.error('Failed to resolve AnalysisRecord taskIds for report links.', {
        analysisIdCount: analysisIds.length, error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return runs.map((run) => {
    const plain = (typeof (run as unknown as { toObject?: () => unknown }).toObject === 'function'
      ? (run as unknown as { toObject: () => Record<string, unknown> }).toObject()
      : run) as MonitoringRunDocument & { reportPath?: string };

    if (!run.auditId) return plain;

    if (run.auditModel === 'AnalysisRecord') {
      const taskId = taskIdById.get(String(run.auditId));
      if (taskId) {
        plain.reportPath = `/account/analysis/${encodeURIComponent(taskId)}`;
      } else {
        // Semantic gap, not a crash: the run points at an AnalysisRecord that
        // no longer exists (or has no taskId) — worth a trace since the
        // symptom in the UI is just a silently-missing "View Report" link.
        routesLogger.warn('Could not resolve reportPath — AnalysisRecord taskId missing.', {
          runId: String(run._id), auditId: String(run.auditId),
        });
      }
    } else if (run.auditModel === 'QuickScan') {
      plain.reportPath = `/account/quick-scans/${encodeURIComponent(String(run.auditId))}`;
    }
    return plain;
  });
}

const routesLogger = logger.child('feature:monitoring:routes');

const VALID_SCHEDULES = new Set<MonitoringSchedule>(['weekly', 'biweekly', 'monthly', 'trimonthly', 'quarterly', 'custom']);
const VALID_SCAN_TYPES = new Set<MonitoringScanType>(['quick', 'full']);
const VALID_DEVICES = new Set<MonitoringDevice>(['desktop', 'tablet', 'mobile']);
const VALID_WCAG_STANDARDS = new Set(['wcag21', 'wcag22', 'combined']);
const VALID_CONFORMANCE_LEVELS = new Set(['A', 'AA', 'AAA']);

function isValidUrlDomain(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    // Accept bare domains too by prefixing a scheme if missing.
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    // eslint-disable-next-line no-new
    new URL(candidate);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates + normalizes the mutable fields of a job (used by both create
 * and update). Returns either a normalized field set or a 400-ready error
 * string — routes decide the response, this stays framework-agnostic.
 */
interface ValidatedJobFields {
  domain?: string;
  schedule?: MonitoringSchedule;
  customCronExpression?: string;
  scanType?: MonitoringScanType;
  wcagStandard?: string;
  conformanceLevel?: string;
  devicesEnabled?: MonitoringDevice[];
  maxPages?: number;
  alertThreshold?: number;
  alertEmails?: string[];
  notifyOnComplete?: boolean;
  notifyOnNewIssues?: boolean;
}

type ValidateJobFieldsResult =
  | { ok: true; fields: ValidatedJobFields }
  | { ok: false; error: string };

function validateJobFields(body: Record<string, unknown>, { partial }: { partial: boolean }): ValidateJobFieldsResult {
  const fields: Record<string, unknown> = {};

  if (body.domain !== undefined) {
    if (!isValidUrlDomain(body.domain)) return { ok: false, error: 'domain must be a valid URL or hostname.' };
    fields.domain = String(body.domain).trim();
  } else if (!partial) {
    return { ok: false, error: 'domain is required.' };
  }

  if (body.schedule !== undefined) {
    if (!VALID_SCHEDULES.has(body.schedule as MonitoringSchedule)) {
      return { ok: false, error: `schedule must be one of: ${[...VALID_SCHEDULES].join(', ')}.` };
    }
    fields.schedule = body.schedule as MonitoringSchedule;
    if (body.schedule === 'custom') {
      if (typeof body.customCronExpression !== 'string' || !body.customCronExpression.trim()) {
        return { ok: false, error: 'customCronExpression is required when schedule is "custom".' };
      }
      fields.customCronExpression = body.customCronExpression.trim();
    }
  } else if (!partial) {
    return { ok: false, error: 'schedule is required.' };
  }

  if (body.scanType !== undefined) {
    if (!VALID_SCAN_TYPES.has(body.scanType as MonitoringScanType)) {
      return { ok: false, error: `scanType must be one of: ${[...VALID_SCAN_TYPES].join(', ')}.` };
    }
    fields.scanType = body.scanType as MonitoringScanType;
  } else if (!partial) {
    return { ok: false, error: 'scanType is required.' };
  }

  if (body.wcagStandard !== undefined) {
    if (!VALID_WCAG_STANDARDS.has(body.wcagStandard as string)) {
      return { ok: false, error: `wcagStandard must be one of: ${[...VALID_WCAG_STANDARDS].join(', ')}.` };
    }
    fields.wcagStandard = body.wcagStandard;
  }

  if (body.conformanceLevel !== undefined) {
    if (!VALID_CONFORMANCE_LEVELS.has(body.conformanceLevel as string)) {
      return { ok: false, error: `conformanceLevel must be one of: ${[...VALID_CONFORMANCE_LEVELS].join(', ')}.` };
    }
    fields.conformanceLevel = body.conformanceLevel;
  }

  if (body.devicesEnabled !== undefined) {
    if (!Array.isArray(body.devicesEnabled) || body.devicesEnabled.some((d) => !VALID_DEVICES.has(d as MonitoringDevice))) {
      return { ok: false, error: `devicesEnabled must be an array containing only: ${[...VALID_DEVICES].join(', ')}.` };
    }
    fields.devicesEnabled = body.devicesEnabled as MonitoringDevice[];
  }

  if (body.maxPages !== undefined) {
    const maxPages = Number(body.maxPages);
    if (!Number.isFinite(maxPages) || maxPages <= 0) return { ok: false, error: 'maxPages must be a positive number.' };
    fields.maxPages = maxPages;
  }

  if (body.alertThreshold !== undefined && body.alertThreshold !== null) {
    const alertThreshold = Number(body.alertThreshold);
    if (!Number.isFinite(alertThreshold) || alertThreshold < 0 || alertThreshold > 100) {
      return { ok: false, error: 'alertThreshold must be a number between 0 and 100.' };
    }
    fields.alertThreshold = alertThreshold;
  }

  if (body.alertEmails !== undefined) {
    if (!Array.isArray(body.alertEmails) || body.alertEmails.some((e) => typeof e !== 'string' || !e.includes('@'))) {
      return { ok: false, error: 'alertEmails must be an array of valid email addresses.' };
    }
    fields.alertEmails = body.alertEmails as string[];
  }

  if (body.notifyOnComplete !== undefined) fields.notifyOnComplete = Boolean(body.notifyOnComplete);
  if (body.notifyOnNewIssues !== undefined) fields.notifyOnNewIssues = Boolean(body.notifyOnNewIssues);

  return { ok: true, fields };
}

function parsePagination(query: Record<string, unknown>): { page: number; limit: number; skip: number } {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(Math.max(1, Number(query.limit) || 20), 100);
  return { page, limit, skip: (page - 1) * limit };
}

// ─────────────────────────────────────────────────────────────────────────
// User-scoped router — mounted at /monitoring
// ─────────────────────────────────────────────────────────────────────────

export const monitoringRouter = Router();

monitoringRouter.get('/jobs', authRequired, asyncHandler(async (request, response) => {
  const userId = request.user!.id;
  const MonitoringJob = await getMonitoringJobModel();

  // activeCount is a plan-limit number (how many active jobs this user has
  // against their plan cap), so it's always computed from the full owned
  // set via countDocuments — never from whatever page of `items` is
  // returned below, so pagination can't skew plan-limit enforcement.
  if (request.query.page === undefined) {
    const [items, planId, activeCount] = await Promise.all([
      MonitoringJob.find({ userId }).sort({ createdAt: -1 }),
      resolveMonitoringPlanId(userId),
      MonitoringJob.countDocuments({ userId, status: 'active' }),
    ]);

    routesLogger.debug('Listed monitoring jobs.', { userId, count: items.length, planId, activeCount });
    response.json({
      success: true,
      items,
      total: items.length,
      page: 1,
      limit: items.length,
      pages: 1,
      planId,
      limits: MONITORING_PLAN_LIMITS[planId],
      activeCount,
    });
    return;
  }

  const { page, limit, skip } = parsePagination(request.query as Record<string, unknown>);

  const [items, total, planId, activeCount] = await Promise.all([
    MonitoringJob.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
    MonitoringJob.countDocuments({ userId }),
    resolveMonitoringPlanId(userId),
    MonitoringJob.countDocuments({ userId, status: 'active' }),
  ]);

  routesLogger.debug('Listed monitoring jobs.', { userId, count: items.length, total, page, limit, planId, activeCount });
  response.json({
    success: true,
    items,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
    planId,
    limits: MONITORING_PLAN_LIMITS[planId],
    activeCount,
  });
}));

monitoringRouter.post('/jobs', authRequired, asyncHandler(async (request, response) => {
  const userId = request.user!.id;
  const validation = validateJobFields(request.body ?? {}, { partial: false });
  if (!validation.ok) {
    routesLogger.info('Rejected job creation — invalid fields.', { userId, error: validation.error });
    response.status(400).json({ error: validation.error });
    return;
  }

  const MonitoringJob = await getMonitoringJobModel();
  const activeJobCount = await MonitoringJob.countDocuments({ userId, status: 'active' });
  const limitCheck = await validateMonitoringJobAgainstPlanLimits(
    userId,
    { scanType: validation.fields.scanType!, schedule: validation.fields.schedule!, customCronExpression: validation.fields.customCronExpression },
    activeJobCount,
  );
  if (!limitCheck.allowed) {
    routesLogger.info('Rejected job creation — plan limit.', { userId, reason: limitCheck.reason });
    response.status(403).json({ error: limitCheck.reason });
    return;
  }

  let nextRunAt: Date;
  try {
    nextRunAt = computeNextRunAt({ schedule: validation.fields.schedule, customCronExpression: validation.fields.customCronExpression });
  } catch (error) {
    const message = error instanceof InvalidCronExpressionError ? error.message : 'Invalid schedule configuration.';
    routesLogger.error('Rejected job creation — could not compute nextRunAt.', { userId, error: message });
    response.status(400).json({ error: message });
    return;
  }

  const job = await MonitoringJob.create({ ...validation.fields, userId, status: 'active', nextRunAt });
  routesLogger.info('Created monitoring job.', { userId, jobId: String(job._id), domain: job.domain, nextRunAt: nextRunAt.toISOString() });
  response.status(201).json({ success: true, item: job });
}));

monitoringRouter.get('/jobs/:id', authRequired, asyncHandler(async (request, response) => {
  const userId = request.user!.id;
  const [MonitoringJob, MonitoringRun] = await Promise.all([getMonitoringJobModel(), getMonitoringRunModel()]);

  const job = await MonitoringJob.findOne({ _id: request.params.id, userId });
  if (!job) {
    routesLogger.info('Job detail lookup missed — not found or not owned.', { userId, jobId: request.params.id });
    response.status(404).json({ error: 'Not found' });
    return;
  }

  const rawRecentRuns = await MonitoringRun.find({ jobId: job._id }).sort({ triggeredAt: -1 }).limit(10);
  const recentRuns = await attachReportPaths(rawRecentRuns);
  routesLogger.debug('Fetched monitoring job detail.', { userId, jobId: String(job._id), recentRunCount: recentRuns.length });
  response.json({ success: true, item: job, recentRuns });
}));

monitoringRouter.put('/jobs/:id', authRequired, asyncHandler(async (request, response) => {
  const userId = request.user!.id;
  const MonitoringJob = await getMonitoringJobModel();

  const job = await MonitoringJob.findOne({ _id: request.params.id, userId });
  if (!job) {
    response.status(404).json({ error: 'Not found' });
    return;
  }

  const validation = validateJobFields(request.body ?? {}, { partial: true });
  if (!validation.ok) {
    routesLogger.info('Rejected job update — invalid fields.', { userId, jobId: request.params.id, error: validation.error });
    response.status(400).json({ error: validation.error });
    return;
  }

  const nextScanType = validation.fields.scanType ?? job.scanType;
  const nextSchedule = validation.fields.schedule ?? job.schedule;
  const nextCustomCron = validation.fields.customCronExpression ?? job.customCronExpression;

  const activeJobCount = await MonitoringJob.countDocuments({ userId, status: 'active', _id: { $ne: job._id } });
  const limitCheck = await validateMonitoringJobAgainstPlanLimits(
    userId, { scanType: nextScanType!, schedule: nextSchedule, customCronExpression: nextCustomCron }, activeJobCount,
  );
  if (!limitCheck.allowed) {
    routesLogger.info('Rejected job update — plan limit.', { userId, jobId: request.params.id, reason: limitCheck.reason });
    response.status(403).json({ error: limitCheck.reason });
    return;
  }

  Object.assign(job, validation.fields);

  if (validation.fields.schedule !== undefined || validation.fields.customCronExpression !== undefined) {
    try {
      job.nextRunAt = computeNextRunAt(job);
    } catch (error) {
      const message = error instanceof InvalidCronExpressionError ? error.message : 'Invalid schedule configuration.';
      routesLogger.error('Rejected job update — could not compute nextRunAt.', { userId, jobId: request.params.id, error: message });
      response.status(400).json({ error: message });
      return;
    }
  }

  await job.save();
  routesLogger.info('Updated monitoring job.', { userId, jobId: String(job._id), updatedFields: Object.keys(validation.fields) });
  response.json({ success: true, item: job });
}));

monitoringRouter.delete('/jobs/:id', authRequired, asyncHandler(async (request, response) => {
  const userId = request.user!.id;
  const [MonitoringJob, MonitoringRun] = await Promise.all([getMonitoringJobModel(), getMonitoringRunModel()]);

  const job = await MonitoringJob.findOneAndDelete({ _id: request.params.id, userId });
  if (!job) {
    response.status(404).json({ error: 'Not found' });
    return;
  }

  const { deletedCount } = await MonitoringRun.deleteMany({ jobId: job._id });
  routesLogger.info('Deleted monitoring job and its runs.', { userId, jobId: String(job._id), deletedRunCount: deletedCount });
  response.json({ success: true });
}));

monitoringRouter.patch('/jobs/:id/pause', authRequired, asyncHandler(async (request, response) => {
  const userId = request.user!.id;
  const MonitoringJob = await getMonitoringJobModel();
  const job = await MonitoringJob.findOneAndUpdate({ _id: request.params.id, userId }, { $set: { status: 'paused' } }, { new: true });
  if (!job) {
    response.status(404).json({ error: 'Not found' });
    return;
  }
  routesLogger.info('Paused monitoring job.', { userId, jobId: String(job._id) });
  response.json({ success: true, item: job });
}));

monitoringRouter.patch('/jobs/:id/resume', authRequired, asyncHandler(async (request, response) => {
  const userId = request.user!.id;
  const MonitoringJob = await getMonitoringJobModel();
  const job = await MonitoringJob.findOne({ _id: request.params.id, userId });
  if (!job) {
    response.status(404).json({ error: 'Not found' });
    return;
  }

  try {
    job.status = 'active';
    job.nextRunAt = computeNextRunAt(job);
    await job.save();
  } catch (error) {
    const message = error instanceof InvalidCronExpressionError ? error.message : 'Invalid schedule configuration.';
    routesLogger.error('Failed to resume job — could not compute nextRunAt.', { userId, jobId: request.params.id, error: message });
    response.status(400).json({ error: message });
    return;
  }

  routesLogger.info('Resumed monitoring job.', { userId, jobId: String(job._id), nextRunAt: job.nextRunAt.toISOString() });
  response.json({ success: true, item: job });
}));

monitoringRouter.patch('/jobs/:id/trigger', authRequired, asyncHandler(async (request, response) => {
  const userId = request.user!.id;
  const MonitoringJob = await getMonitoringJobModel();
  const job = await MonitoringJob.findOne({ _id: request.params.id, userId });
  if (!job) {
    response.status(404).json({ error: 'Not found' });
    return;
  }

  routesLogger.info('Manual trigger requested.', { userId, jobId: String(job._id) });
  const result = await dispatchMonitoringJob(String(job._id));
  if (!result.dispatched) {
    routesLogger.warn('Manual trigger did not dispatch.', { userId, jobId: String(job._id), reason: result.reason });
    response.status(409).json({ error: result.reason || 'Could not dispatch this job right now.' });
    return;
  }

  response.json({ success: true, runId: result.runId, auditId: result.auditId });
}));

monitoringRouter.get('/jobs/:id/runs', authRequired, asyncHandler(async (request, response) => {
  const userId = request.user!.id;
  const [MonitoringJob, MonitoringRun] = await Promise.all([getMonitoringJobModel(), getMonitoringRunModel()]);

  const job = await MonitoringJob.findOne({ _id: request.params.id, userId });
  if (!job) {
    response.status(404).json({ error: 'Not found' });
    return;
  }

  const { page, limit, skip } = parsePagination(request.query as Record<string, unknown>);
  const query = { jobId: job._id };
  const [rawItems, total] = await Promise.all([
    MonitoringRun.find(query).sort({ triggeredAt: -1 }).skip(skip).limit(limit),
    MonitoringRun.countDocuments(query),
  ]);
  const items = await attachReportPaths(rawItems);

  routesLogger.debug('Listed monitoring runs.', { userId, jobId: String(job._id), page, limit, total });
  response.json({ success: true, items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
}));

monitoringRouter.get('/jobs/:id/runs/:runId', authRequired, asyncHandler(async (request, response) => {
  const userId = request.user!.id;
  const [MonitoringJob, MonitoringRun] = await Promise.all([getMonitoringJobModel(), getMonitoringRunModel()]);

  const job = await MonitoringJob.findOne({ _id: request.params.id, userId });
  if (!job) {
    response.status(404).json({ error: 'Not found' });
    return;
  }

  const run = await MonitoringRun.findOne({ _id: request.params.runId, jobId: job._id });
  if (!run) {
    routesLogger.info('Run detail lookup missed — not found for this job.', { userId, jobId: String(job._id), runId: request.params.runId });
    response.status(404).json({ error: 'Not found' });
    return;
  }

  const [item] = await attachReportPaths([run]);
  response.json({ success: true, item });
}));

// Alert log for the job detail page (2.2.6.6) — history of every
// notification attempt sent for this job, newest first.
monitoringRouter.get('/jobs/:id/notifications', authRequired, asyncHandler(async (request, response) => {
  const userId = request.user!.id;
  const MonitoringJob = await getMonitoringJobModel();
  const job = await MonitoringJob.findOne({ _id: request.params.id, userId });
  if (!job) {
    response.status(404).json({ error: 'Not found' });
    return;
  }

  const NotificationLog = await getNotificationLogModel();
  const { page, limit, skip } = parsePagination(request.query as Record<string, unknown>);
  const query = { jobId: job._id };
  const [items, total] = await Promise.all([
    NotificationLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    NotificationLog.countDocuments(query),
  ]);

  routesLogger.debug('Listed monitoring notifications.', { userId, jobId: String(job._id), page, limit, total });
  response.json({ success: true, items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
}));

// Cron-preview helper for the "Custom" schedule UI (2.2.6.6 step 2) —
// doesn't touch any job, just echoes back a human-readable next-run preview.
monitoringRouter.post('/jobs/preview-schedule', authRequired, asyncHandler(async (request, response) => {
  const userId = request.user!.id;
  const { schedule, customCronExpression } = request.body ?? {};
  if (!VALID_SCHEDULES.has(schedule)) {
    routesLogger.info('Rejected schedule preview — invalid schedule value.', { userId, schedule });
    response.status(400).json({ error: `schedule must be one of: ${[...VALID_SCHEDULES].join(', ')}.` });
    return;
  }

  try {
    const nextRunAt = computeNextRunAt({ schedule, customCronExpression });
    const preview = schedule === 'custom' ? describeCronExpression(customCronExpression) : undefined;
    response.json({ success: true, nextRunAt, preview });
  } catch (error) {
    const message = error instanceof InvalidCronExpressionError ? error.message : 'Invalid schedule configuration.';
    routesLogger.info('Rejected schedule preview — could not compute nextRunAt.', { userId, schedule, customCronExpression, error: message });
    response.status(400).json({ error: message });
  }
}));

// ─────────────────────────────────────────────────────────────────────────
// Admin router — mounted at /admin/monitoring
// ─────────────────────────────────────────────────────────────────────────

export const monitoringAdminRouter = Router();
monitoringAdminRouter.use(authRequired, adminRequired);

monitoringAdminRouter.get('/jobs', asyncHandler(async (request, response) => {
  const MonitoringJob = await getMonitoringJobModel();
  const { page, limit, skip } = parsePagination(request.query as Record<string, unknown>);

  const query: Record<string, unknown> = {};
  if (typeof request.query.status === 'string') query.status = request.query.status;
  if (typeof request.query.userId === 'string') query.userId = request.query.userId;

  const [items, total] = await Promise.all([
    MonitoringJob.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    MonitoringJob.countDocuments(query),
  ]);

  routesLogger.debug('Admin listed monitoring jobs.', { adminUserId: request.user!.id, total, filters: query });
  response.json({ success: true, items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
}));

monitoringAdminRouter.patch('/jobs/:id/pause', asyncHandler(async (request, response) => {
  const MonitoringJob = await getMonitoringJobModel();
  const job = await MonitoringJob.findByIdAndUpdate(request.params.id, { $set: { status: 'paused' } }, { new: true });
  if (!job) {
    response.status(404).json({ error: 'Not found' });
    return;
  }
  routesLogger.info('Admin paused monitoring job.', { adminUserId: request.user!.id, jobId: String(job._id) });
  response.json({ success: true, item: job });
}));

monitoringAdminRouter.post('/jobs/:id/trigger', asyncHandler(async (request, response) => {
  const MonitoringJob = await getMonitoringJobModel();
  const job = await MonitoringJob.findById(request.params.id);
  if (!job) {
    response.status(404).json({ error: 'Not found' });
    return;
  }

  routesLogger.info('Admin manual trigger requested.', { adminUserId: request.user!.id, jobId: String(job._id) });
  const result = await dispatchMonitoringJob(String(job._id));
  if (!result.dispatched) {
    routesLogger.warn('Admin manual trigger did not dispatch.', { adminUserId: request.user!.id, jobId: String(job._id), reason: result.reason });
    response.status(409).json({ error: result.reason || 'Could not dispatch this job right now.' });
    return;
  }

  response.json({ success: true, runId: result.runId, auditId: result.auditId });
}));
