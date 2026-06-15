import { env } from '../../config/env.ts';
import { logger } from '../../config/logger.ts';
import type { JobQueue } from '../../infrastructure/queues/job-queue.ts';
import AuditJob from '../../models/audit-job.model.ts';
import {
  getAnalysisRecordModel,
  getQuickScanModel,
  type AnalysisRecordDocument,
  type AnalysisRecordModel,
  type QuickScanModel,
} from './audits.dependencies.ts';

const auditRecoveryLogger = logger.child('feature:audits:recovery');

interface RecoveryQueueJobLike {
  retryAfter?: Date;
  status?: string;
}

interface RecoveryQueueJobModel {
  findOne(query: Record<string, unknown>): Promise<RecoveryQueueJobLike | null>;
}

export interface AuditRecoveryDependencies {
  AnalysisRecord?: AnalysisRecordModel;
  QuickScan?: QuickScanModel;
  AuditJobModel?: RecoveryQueueJobModel;
  fullAuditQueue: JobQueue;
  quickScanQueue: JobQueue;
  now?: Date;
  retryDelayMs?: number;
  batchSize?: number;
  maxAttempts?: number;
}

export interface AuditRecoveryRunSummary {
  fullAuditsRecovered: number;
  quickScansRecovered: number;
  skippedActiveJobs: number;
  skippedMaxAttempts: number;
  errors: number;
}

function createTaskId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getRecordId(record: { _id?: string }): string | undefined {
  return record._id ? String(record._id) : undefined;
}

function shouldSkipForMaxAttempts(
  record: { autoRecoveryAttempts?: number },
  maxAttempts: number,
): boolean {
  return Number(record.autoRecoveryAttempts || 0) >= maxAttempts;
}

function resetFullAuditRecordForRetry(record: AnalysisRecordDocument): void {
  record.status = 'queued';
  record.emailStatus = 'pending';
  record.emailError = undefined;
  record.failureReason = undefined;
  record.attachmentCount = 0;
  record.emailAccepted = [];
  record.emailRejected = [];
  record.reportDirectory = undefined;
  record.reportStorage = undefined;
  record.reportFiles = [];
  record.score = undefined;
  record.scoreCard = undefined;
  record.aiReport = undefined;
}

function markAutoRecoveryAttempt(
  record: { autoRecoveryAttempts?: number; lastAutoRecoveryAt?: Date },
  now: Date,
): void {
  record.autoRecoveryAttempts = Number(record.autoRecoveryAttempts || 0) + 1;
  record.lastAutoRecoveryAt = now;
}

async function hasActiveFullAuditQueueJob(
  AuditJobModel: RecoveryQueueJobModel,
  taskId: string,
  now: Date,
): Promise<boolean> {
  const existing = await AuditJobModel.findOne({
    taskId,
    jobType: 'full-audit',
    $or: [
      { status: { $in: ['queued', 'processing'] } },
      { status: 'failed', retryAfter: { $gt: now } },
    ],
  });

  return Boolean(existing);
}

async function hasActiveQuickScanQueueJob(
  AuditJobModel: RecoveryQueueJobModel,
  quickScanId: string,
  now: Date,
): Promise<boolean> {
  const existing = await AuditJobModel.findOne({
    quickScanId,
    jobType: 'quick-scan',
    $or: [
      { status: { $in: ['queued', 'processing'] } },
      { status: 'failed', retryAfter: { $gt: now } },
    ],
  });

  return Boolean(existing);
}

async function recoverFullAuditRecords(
  deps: Required<Pick<AuditRecoveryDependencies, 'fullAuditQueue' | 'retryDelayMs' | 'batchSize' | 'maxAttempts'>> & {
    AnalysisRecord: AnalysisRecordModel;
    AuditJobModel: RecoveryQueueJobModel;
    now: Date;
  },
): Promise<Omit<AuditRecoveryRunSummary, 'quickScansRecovered'>> {
  const cutoff = new Date(deps.now.getTime() - deps.retryDelayMs);
  const candidates = await deps.AnalysisRecord.find({
    status: { $in: ['queued', 'processing', 'failed'] },
    updatedAt: { $lte: cutoff },
  })
    .sort({ updatedAt: 1 })
    .limit(deps.batchSize);

  let fullAuditsRecovered = 0;
  let skippedActiveJobs = 0;
  let skippedMaxAttempts = 0;
  let errors = 0;

  for (const record of candidates) {
    const taskId = String(record.taskId || '').trim();
    if (!taskId || !record.email || !record.url) {
      continue;
    }

    if (shouldSkipForMaxAttempts(record, deps.maxAttempts)) {
      skippedMaxAttempts += 1;
      continue;
    }

    if (await hasActiveFullAuditQueueJob(deps.AuditJobModel, taskId, deps.now)) {
      skippedActiveJobs += 1;
      continue;
    }

    try {
      resetFullAuditRecordForRetry(record);
      markAutoRecoveryAttempt(record, deps.now);
      await record.save();

      await deps.fullAuditQueue.addJob({
        email: record.email,
        url: record.url,
        userId: record.user || undefined,
        taskId,
        planId: record.planId,
        selectedDevice: record.device,
        firstName: record.firstName || '',
        lastName: record.lastName || '',
        recordId: getRecordId(record),
      });

      fullAuditsRecovered += 1;
      auditRecoveryLogger.warn('Auto-recovered full audit record.', {
        taskId,
        email: record.email,
        url: record.url,
        status: record.status,
        autoRecoveryAttempts: record.autoRecoveryAttempts,
      });
    } catch (error) {
      errors += 1;
      record.status = 'failed';
      record.emailStatus = 'failed';
      record.emailError = error instanceof Error ? error.message : String(error);
      record.failureReason = `Auto-recovery enqueue failed: ${record.emailError}`;
      await record.save().catch(() => undefined);

      auditRecoveryLogger.error('Failed to auto-recover full audit record.', {
        taskId,
        email: record.email,
        url: record.url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    fullAuditsRecovered,
    skippedActiveJobs,
    skippedMaxAttempts,
    errors,
  };
}

async function recoverQuickScanRecords(
  deps: Required<Pick<AuditRecoveryDependencies, 'quickScanQueue' | 'retryDelayMs' | 'batchSize' | 'maxAttempts'>> & {
    QuickScan: QuickScanModel;
    AuditJobModel: RecoveryQueueJobModel;
    now: Date;
  },
): Promise<Omit<AuditRecoveryRunSummary, 'fullAuditsRecovered'>> {
  const cutoff = new Date(deps.now.getTime() - deps.retryDelayMs);
  const candidates = await deps.QuickScan.find({
    status: { $in: ['queued', 'processing'] },
    scanScore: null,
    $or: [
      { scannerResultAt: { $exists: false } },
      { scannerResultAt: null },
    ],
    updatedAt: { $lte: cutoff },
  })
    .sort({ updatedAt: 1 })
    .limit(deps.batchSize);

  let quickScansRecovered = 0;
  let skippedActiveJobs = 0;
  let skippedMaxAttempts = 0;
  let errors = 0;

  for (const record of candidates) {
    const quickScanId = getRecordId(record);
    if (!quickScanId || !record.email || !record.url) {
      continue;
    }

    if (shouldSkipForMaxAttempts(record, deps.maxAttempts)) {
      skippedMaxAttempts += 1;
      continue;
    }

    if (await hasActiveQuickScanQueueJob(deps.AuditJobModel, quickScanId, deps.now)) {
      skippedActiveJobs += 1;
      continue;
    }

    try {
      const staleScannerJobId = record.scannerJobId ? String(record.scannerJobId) : undefined;
      const claimedRecord = await deps.QuickScan.findOneAndUpdate(
        {
          _id: record._id,
          status: { $in: ['queued', 'processing'] },
          scannerJobId: staleScannerJobId || null,
          scanScore: null,
          $or: [
            { scannerResultAt: { $exists: false } },
            { scannerResultAt: null },
          ],
          updatedAt: { $lte: cutoff },
        },
        {
          $set: {
            status: 'queued',
            errorMessage: undefined,
            emailStatus: 'pending',
            emailError: undefined,
            scanScore: undefined,
            scoreCard: undefined,
            aiReport: undefined,
            reportGenerated: false,
            reportPath: null,
            reportDirectory: undefined,
            reportStorage: undefined,
            reportFiles: [],
            scanDate: deps.now,
            fallbackScannerJobId: undefined,
            scannerErrorCode: undefined,
            scannerQueueStatus: 'pending',
            scannerResultAt: undefined,
            lastAutoRecoveryAt: deps.now,
          },
          $inc: { autoRecoveryAttempts: 1 },
          $push: {
            scannerAttemptHistory: {
              scannerJobId: staleScannerJobId,
              scannerTier: record.scannerTier || 'aws',
              queueKind: 'quick',
              status: 'stale_requeued',
              reason: 'No scanner result was received before the auto-recovery delay elapsed.',
              recoveredAt: deps.now,
            },
          },
        },
        { new: true },
      );

      if (!claimedRecord) {
        skippedActiveJobs += 1;
        continue;
      }

      await deps.quickScanQueue.addJob({
        email: claimedRecord.email || record.email,
        url: claimedRecord.url || record.url,
        firstName: claimedRecord.firstName || '',
        lastName: claimedRecord.lastName || '',
        userId: null,
        taskId: createTaskId(),
        jobType: 'quick-scan',
        subscriptionId: null,
        priority: 2,
        quickScanId,
        selectedDevice: claimedRecord.device || record.device || 'desktop',
      });

      quickScansRecovered += 1;
      auditRecoveryLogger.warn('Auto-recovered quick scan record.', {
        quickScanId,
        email: claimedRecord.email,
        url: claimedRecord.url,
        status: claimedRecord.status,
        staleScannerJobId,
        autoRecoveryAttempts: claimedRecord.autoRecoveryAttempts,
      });
    } catch (error) {
      errors += 1;
      record.status = 'failed';
      record.emailStatus = 'failed';
      record.emailError = error instanceof Error ? error.message : String(error);
      record.errorMessage = `Auto-recovery enqueue failed: ${record.emailError}`;
      await record.save().catch(() => undefined);

      auditRecoveryLogger.error('Failed to auto-recover quick scan record.', {
        quickScanId,
        email: record.email,
        url: record.url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    quickScansRecovered,
    skippedActiveJobs,
    skippedMaxAttempts,
    errors,
  };
}

export async function recoverAuditRecords(dependencies: AuditRecoveryDependencies): Promise<AuditRecoveryRunSummary> {
  const AnalysisRecord = dependencies.AnalysisRecord || await getAnalysisRecordModel();
  const QuickScan = dependencies.QuickScan || await getQuickScanModel();
  const AuditJobModel = dependencies.AuditJobModel || (AuditJob as unknown as RecoveryQueueJobModel);
  const now = dependencies.now || new Date();
  const retryDelayMs = dependencies.retryDelayMs ?? env.auditRecoveryRetryDelayMs;
  const batchSize = dependencies.batchSize ?? env.auditRecoveryBatchSize;
  const maxAttempts = dependencies.maxAttempts ?? env.auditRecoveryMaxAttempts;

  const [fullSummary, quickSummary] = await Promise.all([
    recoverFullAuditRecords({
      AnalysisRecord,
      AuditJobModel,
      fullAuditQueue: dependencies.fullAuditQueue,
      now,
      retryDelayMs,
      batchSize,
      maxAttempts,
    }),
    recoverQuickScanRecords({
      QuickScan,
      AuditJobModel,
      quickScanQueue: dependencies.quickScanQueue,
      now,
      retryDelayMs,
      batchSize,
      maxAttempts,
    }),
  ]);

  return {
    fullAuditsRecovered: fullSummary.fullAuditsRecovered,
    quickScansRecovered: quickSummary.quickScansRecovered,
    skippedActiveJobs: fullSummary.skippedActiveJobs + quickSummary.skippedActiveJobs,
    skippedMaxAttempts: fullSummary.skippedMaxAttempts + quickSummary.skippedMaxAttempts,
    errors: fullSummary.errors + quickSummary.errors,
  };
}
