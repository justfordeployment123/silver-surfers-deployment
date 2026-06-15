import fs from 'node:fs/promises';
import path from 'node:path';

import { env } from '../../config/env.ts';
import { logger } from '../../config/logger.ts';
import type { QueueJobInput, QueueReportStorage, QueueResult } from '../../infrastructure/queues/job-queue.ts';
import {
  createScannerJobId,
  dispatchScannerAuditJob,
  requestScannerAudit,
  type ScannerServiceAuditSuccess,
} from '../scanner/scanner-client.ts';
import { buildAuditScorecard } from './audit-scorecard.ts';
import { generateLiteAccessibilityReport } from './report-generation.ts';
import { collectAttachmentsRecursive, sendAuditReportEmail } from './report-delivery.ts';
import { buildStoredReportFilesFromAttachments, mergeStoredReportFilesWithStorage } from './report-files.ts';
import { cleanupLocalReportDirectoryWhenStored } from './report-retention.ts';
import { getQuickScanModel } from './audits.dependencies.ts';

const quickScanLogger = logger.child('feature:audits:quick-scan');

export interface QuickScanJobPayload {
  email: string;
  url: string;
  firstName?: string;
  lastName?: string;
  quickScanId?: string;
  selectedDevice?: string;
}

function requireString(value: unknown, field: string): string {
  const normalized = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  if (!normalized) {
    throw new Error(`${field} is required.`);
  }

  return normalized;
}

function optionalString(value: unknown): string | undefined {
  const normalized = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  return normalized || undefined;
}

function normalizeQuickScanDevice(value: unknown): 'desktop' | 'mobile' | 'tablet' {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'mobile' || normalized === 'tablet') {
    return normalized;
  }

  return 'desktop';
}

function sanitizePathSegment(value: string, maxLength?: number): string {
  const sanitized = value.replace(/[^a-z0-9]/gi, '_');
  const trimmed = maxLength ? sanitized.slice(0, maxLength) : sanitized;
  return trimmed || 'scan';
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function mapScannerError(errorCode: string | undefined, fallback: string): string {
  if (errorCode === 'SCAN_TIMEOUT' || errorCode === 'REQUEST_TIMEOUT') {
    return 'The website scan timed out. The website may be slow to load or experiencing issues. Please try again in a few moments.';
  }

  if (errorCode === 'SERVICE_UNAVAILABLE') {
    return 'The scanner service is temporarily unavailable. Please try again in a few moments.';
  }

  if (errorCode === 'SCANNER_BROWSER_UNAVAILABLE' || errorCode === 'SCANNER_BROWSER_LAUNCH_FAILED') {
    return fallback;
  }

  if (errorCode === 'SERVER_ERROR') {
    return 'The scanner service encountered an error. Please try again later or contact support if the issue persists.';
  }

  return fallback;
}

function buildReportDirectory(reportStorage: QueueReportStorage | undefined, fallback: string): string {
  if (reportStorage?.provider === 's3' && reportStorage.bucket && reportStorage.prefix) {
    return `s3://${reportStorage.bucket}/${reportStorage.prefix}`;
  }

  return fallback;
}

function shouldUseEventDrivenQuickResults(): boolean {
  return env.scannerDispatchMode === 'sqs' && env.scannerSqsResultWorkerEnabled;
}

function toQuickScanJobPayload(payload: QueueJobInput): QuickScanJobPayload {
  return {
    email: requireString(payload.email, 'Quick scan email'),
    url: requireString(payload.url, 'Quick scan URL'),
    firstName: optionalString(payload.firstName),
    lastName: optionalString(payload.lastName),
    quickScanId: payload.quickScanId == null ? undefined : String(payload.quickScanId),
    selectedDevice: normalizeQuickScanDevice(payload.selectedDevice),
  };
}

export function buildQuickScanJobFromRecord(record: {
  _id?: unknown;
  email?: string;
  url?: string;
  firstName?: string;
  lastName?: string;
  device?: string | null;
}): QuickScanJobPayload {
  return {
    email: requireString(record.email, 'Quick scan email'),
    url: requireString(record.url, 'Quick scan URL'),
    firstName: optionalString(record.firstName),
    lastName: optionalString(record.lastName),
    quickScanId: record._id == null ? undefined : String(record._id),
    selectedDevice: normalizeQuickScanDevice(record.device),
  };
}

export async function completeQuickScanFromAuditResult(
  job: QuickScanJobPayload,
  auditResult: ScannerServiceAuditSuccess,
): Promise<QueueResult> {
  const QuickScan = await getQuickScanModel();
  let jsonReportPath: string | undefined;

  try {
    jsonReportPath = auditResult.reportPath;
    const reportData = JSON.parse(await fs.readFile(jsonReportPath, 'utf8')) as Record<string, unknown>;
    const liteScorecard = buildAuditScorecard(reportData, {
      isLiteVersion: true,
      pageUrl: job.url,
    });
    const uniqueQuickScanId = job.quickScanId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const userSpecificOutputDir = path.join(
      'reports-lite',
      sanitizePathSegment(job.email),
      `${uniqueQuickScanId}-${sanitizePathSegment(job.url, 50)}`,
    );

    await fs.rm(userSpecificOutputDir, { recursive: true, force: true }).catch(() => undefined);
    await fs.mkdir(userSpecificOutputDir, { recursive: true });

    const pdfResult = await generateLiteAccessibilityReport(jsonReportPath, userSpecificOutputDir);
    const score = Number.isFinite(liteScorecard.overallScore)
      ? Math.round(liteScorecard.overallScore)
      : Number.parseFloat(String(pdfResult.score));
    if (job.quickScanId) {
      const attachmentsPreview = await collectAttachmentsRecursive(userSpecificOutputDir).catch(() => []);
      await QuickScan.findByIdAndUpdate(job.quickScanId, {
        device: normalizeQuickScanDevice(job.selectedDevice),
        scanScore: Number.isFinite(score) ? Math.round(score) : undefined,
        scoreCard: liteScorecard,
        status: 'completed',
        emailStatus: 'sending',
        emailError: undefined,
        reportGenerated: true,
        reportPath: pdfResult.reportPath,
        reportDirectory: userSpecificOutputDir,
        reportFiles: buildStoredReportFilesFromAttachments(attachmentsPreview),
      }).catch((error) => {
        quickScanLogger.warn('Failed to persist quick scan score.', {
          quickScanId: job.quickScanId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    const emailResult = await Promise.race([
      sendAuditReportEmail({
        to: job.email,
        subject: 'Your SilverSurfers Quick Scan Results',
        text: 'Attached is your older adult-friendly Quick Scan report. Thanks for trying SilverSurfers! For a full multi-page audit analysis and detailed guidance, consider upgrading.',
        folderPath: userSpecificOutputDir,
        isQuickScan: true,
        websiteUrl: job.url,
        quickScanScore: pdfResult.score,
      }),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error('Quick scan email timed out after 5 minutes')), 300_000);
      }),
    ]);

    if (emailResult.success === false) {
      const emailFailureMessage = emailResult.error || 'Quick scan email failed.';

      if (job.quickScanId) {
        await QuickScan.findByIdAndUpdate(job.quickScanId, {
          status: 'completed',
          emailStatus: 'failed',
          emailError: emailFailureMessage,
        }).catch((error) => {
          quickScanLogger.warn('Failed to persist quick scan email failure state.', {
            quickScanId: job.quickScanId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }

      quickScanLogger.warn('Quick scan completed but email delivery failed.', {
        email: job.email,
        url: job.url,
        quickScanId: job.quickScanId,
        error: emailFailureMessage,
      });

      return {
        emailStatus: 'failed',
        attachmentCount: 0,
        reportDirectory: userSpecificOutputDir,
        scansUsed: 1,
      };
    }

    if (job.quickScanId && emailResult.storage) {
      const attachmentsPreview = await collectAttachmentsRecursive(userSpecificOutputDir).catch(() => []);
      await QuickScan.findByIdAndUpdate(job.quickScanId, {
        emailStatus: 'sent',
        emailError: undefined,
        reportStorage: emailResult.storage,
        reportPath: emailResult.storage.provider === 's3'
          ? emailResult.storage.objects?.[0]?.key || pdfResult.reportPath
          : pdfResult.reportPath,
        reportDirectory: buildReportDirectory(emailResult.storage, userSpecificOutputDir),
        reportFiles: mergeStoredReportFilesWithStorage(
          buildStoredReportFilesFromAttachments(attachmentsPreview),
          emailResult.storage,
        ),
      }).catch((error) => {
        quickScanLogger.warn('Failed to persist quick scan storage metadata.', {
          quickScanId: job.quickScanId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    if (job.quickScanId && !emailResult.storage) {
      await QuickScan.findByIdAndUpdate(job.quickScanId, {
        emailStatus: 'sent',
        emailError: undefined,
      }).catch((error) => {
        quickScanLogger.warn('Failed to persist quick scan email sent status.', {
          quickScanId: job.quickScanId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    await cleanupLocalReportDirectoryWhenStored({
      reportDirectory: userSpecificOutputDir,
      reportStorage: emailResult.storage,
      taskId: job.quickScanId,
      source: 'quick-scan',
    }).catch((cleanupError) => {
      quickScanLogger.warn('Failed to remove local quick scan reports after S3 upload.', {
        quickScanId: job.quickScanId,
        reportDirectory: userSpecificOutputDir,
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      });
    });

    await sleep(10_000);

    quickScanLogger.info('Quick scan completed.', {
      email: job.email,
      url: job.url,
      quickScanId: job.quickScanId,
      scorePct: Number.isFinite(score) ? score : pdfResult.score,
      cacheMinutes: Math.max(1, Math.round(env.quickScanReportTtlMs / 60_000)),
    });

    return {
      emailStatus: 'sent',
      attachmentCount: emailResult.attachmentCount || emailResult.totalFiles || 0,
      reportDirectory: buildReportDirectory(emailResult.storage, userSpecificOutputDir),
      reportStorage: emailResult.storage,
      scansUsed: 1,
    };
  } finally {
    if (jsonReportPath) {
      await fs.unlink(jsonReportPath).catch((error) => {
        quickScanLogger.warn('Failed to delete temporary quick scan report.', {
          reportPath: jsonReportPath,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }
}

export async function runQuickScanProcess(payload: QueueJobInput): Promise<QueueResult> {
  const job = toQuickScanJobPayload(payload);
  const fullName = [job.firstName, job.lastName].filter(Boolean).join(' ') || 'Valued Customer';
  const QuickScan = await getQuickScanModel();

  quickScanLogger.info('Starting quick scan job.', {
    email: job.email,
    url: job.url,
    quickScanId: job.quickScanId,
    device: job.selectedDevice,
    fullName,
  });

  if (job.quickScanId) {
    await QuickScan.findByIdAndUpdate(job.quickScanId, {
      status: 'processing',
      emailStatus: shouldUseEventDrivenQuickResults() ? 'pending' : 'sending',
      emailError: undefined,
      scannerQueueStatus: 'pending',
      scannerErrorCode: undefined,
    }).catch((error) => {
      quickScanLogger.warn('Failed to mark quick scan as processing.', {
        quickScanId: job.quickScanId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  try {
    if (shouldUseEventDrivenQuickResults()) {
      const scannerJobId = createScannerJobId();

      if (job.quickScanId) {
        await QuickScan.findByIdAndUpdate(job.quickScanId, {
          $set: {
            status: 'processing',
            emailStatus: 'pending',
            scannerJobId,
            primaryScannerJobId: scannerJobId,
            fallbackScannerJobId: undefined,
            scannerTier: 'aws',
            scannerFallbackCount: 0,
            scannerQueueStatus: 'pending',
            scannerErrorCode: undefined,
            scannerArtifact: undefined,
          },
          $push: {
            scannerAttemptHistory: {
              scannerJobId,
              scannerTier: 'aws',
              queueKind: 'quick',
              status: 'queued',
              queuedAt: new Date(),
            },
          },
        }).catch((error) => {
          quickScanLogger.warn('Failed to persist quick scan scanner job id before dispatch.', {
            quickScanId: job.quickScanId,
            scannerJobId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }

      const dispatchResult = await dispatchScannerAuditJob({
        url: job.url,
        device: normalizeQuickScanDevice(job.selectedDevice),
        format: 'json',
        isLiteVersion: true,
        includeReport: true,
        scannerQueue: 'quick',
        scannerJobId,
      });

      if (!dispatchResult.success) {
        throw new Error(mapScannerError(dispatchResult.errorCode, dispatchResult.error));
      }

      if (job.quickScanId) {
        await QuickScan.findByIdAndUpdate(job.quickScanId, {
          status: 'processing',
          emailStatus: 'pending',
          scannerQueueStatus: 'queued',
          scannerErrorCode: undefined,
          scannerTier: dispatchResult.scannerTier,
        }).catch((error) => {
          quickScanLogger.warn('Failed to persist quick scan scanner job id.', {
            quickScanId: job.quickScanId,
            scannerJobId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }

      quickScanLogger.info('Quick scan scanner job dispatched; result worker will finish report delivery.', {
        email: job.email,
        url: job.url,
        quickScanId: job.quickScanId,
        scannerJobId,
      });

      return {
        emailStatus: 'pending',
        scansUsed: 1,
      };
    }

    const auditResult = await requestScannerAudit({
      url: job.url,
      device: normalizeQuickScanDevice(job.selectedDevice),
      format: 'json',
      isLiteVersion: true,
      includeReport: true,
      scannerQueue: 'quick',
    });

    if (!auditResult.success) {
      quickScanLogger.error('Scanner-service audit failed during quick scan.', {
        email: job.email,
        url: job.url,
        quickScanId: job.quickScanId,
        errorCode: auditResult.errorCode,
        statusCode: auditResult.statusCode,
        error: auditResult.error,
        originalError: auditResult.originalError,
      });

      throw new Error(mapScannerError(auditResult.errorCode, auditResult.error));
    }

    return await completeQuickScanFromAuditResult(job, auditResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (job.quickScanId) {
      await QuickScan.findByIdAndUpdate(job.quickScanId, {
        status: 'failed',
        emailStatus: 'failed',
        emailError: message,
        errorMessage: message,
        scannerQueueStatus: 'failed',
      }).catch((updateError) => {
        quickScanLogger.warn('Failed to persist quick scan failure status.', {
          quickScanId: job.quickScanId,
          error: updateError instanceof Error ? updateError.message : String(updateError),
        });
      });
    }

    quickScanLogger.error('Quick scan job failed.', {
      email: job.email,
      url: job.url,
      quickScanId: job.quickScanId,
      error: message,
    });

    throw error instanceof Error ? error : new Error(message);
  }
}
