import fs from 'node:fs/promises';
import path from 'node:path';

import { extractInternalLinks } from './internal-links.ts';
import {
  type CachedCompletedFullAuditSnapshot,
  getCachedCompletedFullAuditSnapshot,
  getCachedFullAuditPageReport,
  materializeCachedFullAuditPageReport,
  setCachedCompletedFullAuditSnapshot,
  setCachedFullAuditPageReport,
} from './audit-cache.ts';
import { requestScannerAudit, requestScannerLoadSnapshot } from '../scanner/scanner-client.ts';
import { generateAuditAiReport } from './ai-reporting.ts';
import { buildRemediationRoadmap } from './analysis-details.ts';
import { env } from '../../config/env.ts';
import { logger } from '../../config/logger.ts';
import { resolveBackendPath } from '../../config/paths.ts';
import type { QueueJobInput, QueueResult } from '../../infrastructure/queues/job-queue.ts';
import { buildAggregateAuditScorecard, buildAuditScorecard, type AuditPlatformScore, type AuditScorecard } from './audit-scorecard.ts';
import { getAnalysisRecordModel, getSubscriptionModel, type AnalysisRecordDocument } from './audits.dependencies.ts';
import {
  applyFullAuditEmailResult,
  buildFullAuditEmailContent,
  buildSealResultsFilePath,
  resolveDevicesToAudit,
  sanitizePathSegment,
  type FullAuditDevice,
  type FullAuditEmailResult,
  type FullAuditScannerMode,
} from './full-audit.helpers.ts';
import { collectAttachmentsRecursive, sendAuditReportEmail, sendDirectMail, type ReportAttachment } from './report-delivery.ts';
import { buildStoredReportFilesFromAttachments, mergeStoredReportFilesWithStorage, type StoredReportFile } from './report-files.ts';
import { cleanupLocalReportDirectoryWhenStored } from './report-retention.ts';
import { checkScoreThreshold } from './threshold-check.ts';
import {
  planFullAuditTargetPages,
  resolveFullAuditCompletionStatus,
  selectFullAuditTargetPages,
  shouldPreferLiteScannerForLoad,
  type FullAuditExecutionSummary,
  type FullAuditTargetResult,
} from './full-audit.strategy.ts';
import {
  calculateSeniorFriendlinessScore,
  generateCombinedPlatformReport,
  generateAuditAiSummaryPdf,
  generateLiteAccessibilityReport,
  generateSeniorAccessibilityReport,
  generateSummaryPDF,
  mergePDFsByPlatform,
  type FullAuditPlatformReport,
} from './report-generation.ts';

const fullAuditLogger = logger.child('feature:audits:full-audit');

interface FullAuditJobPayload {
  email: string;
  url: string;
  userId?: string;
  taskId?: string;
  planId?: string | null;
  selectedDevice?: string | null;
  firstName?: string;
  lastName?: string;
  subscriptionId?: string | null;
  recordId?: string;
}

interface InternalLinksExtractionResult {
  success: boolean;
  links: string[];
  details?: string;
}

interface FullAuditReportEntry extends FullAuditPlatformReport {
  scoreCard: AuditScorecard | null;
  isLiteVersion?: boolean;
}

interface FullAuditPageScanResult {
  success: boolean;
  reportPath?: string;
  isLiteVersion: boolean;
  scanModeUsed: FullAuditScannerMode;
  shouldUseLiteForFuture?: boolean;
  fullFailureCountDelta?: number;
  degradedReason?: string;
  fromCache?: boolean;
  error?: string;
  errorCode?: string;
  statusCode?: number;
  originalError?: string;
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

function optionalNullableString(value: unknown): string | null | undefined {
  if (value === null || value === undefined) {
    return value as null | undefined;
  }

  const normalized = String(value).trim();
  return normalized || undefined;
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function buildFullAuditPdfFileName(url: string, device: FullAuditDevice): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const hostname = parsed.hostname.replace(/^www\./, '');
    let pathname = parsed.pathname.replace(/[^a-zA-Z0-9]/g, '_');
    if (pathname.length > 40) {
      pathname = `${pathname.slice(0, 40)}_`;
    }

    const hash = Buffer.from(url).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    return `${hostname}${pathname ? `_${pathname}` : ''}_${hash}-${device}.pdf`;
  } catch {
    return `report_${device}.pdf`;
  }
}

function toFullAuditJobPayload(payload: QueueJobInput): FullAuditJobPayload {
  return {
    email: requireString(payload.email, 'Full audit email'),
    url: requireString(payload.url, 'Full audit URL'),
    userId: optionalString(payload.userId),
    taskId: optionalString(payload.taskId),
    planId: optionalNullableString(payload.planId),
    selectedDevice: optionalNullableString(payload.selectedDevice),
    firstName: optionalString(payload.firstName),
    lastName: optionalString(payload.lastName),
    subscriptionId: optionalNullableString(payload.subscriptionId),
    recordId: optionalString(payload.recordId),
  };
}

async function resolveEffectivePlanId(
  planId: string | null | undefined,
  subscriptionId: string | null | undefined,
): Promise<string> {
  if (planId) {
    return planId;
  }

  if (subscriptionId) {
    try {
      const Subscription = await getSubscriptionModel();
      const subscription = await Subscription.findById(subscriptionId).lean();
      if (subscription?.planId) {
        return subscription.planId;
      }
    } catch (error) {
      fullAuditLogger.warn('Plan lookup failed for subscription.', {
        subscriptionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return 'starter';
}

async function findOrCreateAnalysisRecord(job: FullAuditJobPayload, planId: string, finalReportFolder: string): Promise<AnalysisRecordDocument> {
  const AnalysisRecord = await getAnalysisRecordModel();

  let record: AnalysisRecordDocument | null = null;

  if (job.recordId) {
    record = await AnalysisRecord.findById(job.recordId);
  }

  if (!record && job.taskId) {
    record = await AnalysisRecord.findOne({ taskId: job.taskId });
  }

  if (!record) {
    record = await AnalysisRecord.findOne(
      { email: job.email, url: job.url, status: 'queued' },
      {},
      { sort: { createdAt: -1 } },
    );
  }

  if (!record) {
    record = await AnalysisRecord.create({
      user: job.userId || undefined,
      email: job.email,
      firstName: job.firstName || '',
      lastName: job.lastName || '',
      url: job.url,
      taskId: job.taskId,
      status: 'queued',
      emailStatus: 'pending',
      reportDirectory: finalReportFolder,
      planId,
      device: job.selectedDevice || null,
    });
  } else {
    if (!record.taskId && job.taskId) {
      record.taskId = job.taskId;
    }
    if (!record.planId) {
      record.planId = planId;
    }
    if (!record.reportDirectory) {
      record.reportDirectory = finalReportFolder;
    }
    if (!record.device && job.selectedDevice) {
      record.device = job.selectedDevice;
    }
  }

  record.status = 'processing';
  record.emailStatus = 'pending';
  record.emailError = undefined;
  record.failureReason = undefined;
  record.reportDirectory = finalReportFolder;
  record.reportStorage = undefined;
  record.reportFiles = [];
  record.attachmentCount = 0;
  record.score = undefined;
  record.scoreCard = undefined;
  record.aiReport = undefined;
  record.warnings = [];
  record.plannedTargetCount = 0;
  record.successfulTargetCount = 0;
  record.degradedTargetCount = 0;
  record.failedTargetCount = 0;
  record.scanTargets = [];
  await record.save().catch((error) => {
    fullAuditLogger.warn('Failed to persist processing state for analysis record.', {
      taskId: job.taskId,
      email: job.email,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  return record;
}

async function extractLinksToAudit(url: string): Promise<string[]> {
  const crawlerOptions = {
    maxLinks: env.fullAuditMaxPages,
    maxDepth: env.fullAuditMaxDepth,
    delayMs: env.fullAuditCrawlDelayMs,
    timeout: env.fullAuditCrawlTimeoutMs,
    maxRetries: env.fullAuditCrawlMaxRetries,
  };

  const extractionResult = await extractInternalLinks(url, {
    ...crawlerOptions,
  });

  if (!extractionResult.success) {
    throw new Error(`Link extraction failed: ${extractionResult.details || 'Unknown error'}`);
  }

  return extractionResult.links;
}

async function auditLinkForDevice(
  websiteUrl: string,
  link: string,
  device: FullAuditDevice,
  finalReportFolder: string,
  auditResult: FullAuditPageScanResult,
): Promise<FullAuditReportEntry | null> {
  if (!auditResult.success || !auditResult.reportPath) {
    fullAuditLogger.error('Skipping failed full-audit page scan.', {
      url: link,
      device,
      error: (auditResult as any).error || 'Unknown audit error',
      errorCode: (auditResult as any).errorCode,
      statusCode: (auditResult as any).statusCode,
      originalError: (auditResult as any).originalError,
    });
    return null;
  }

  const reportData = JSON.parse(await fs.readFile(auditResult.reportPath, 'utf8')) as Record<string, unknown>;
  await setCachedFullAuditPageReport({
    websiteUrl,
    pageUrl: link,
    device,
    isLiteVersion: auditResult.isLiteVersion,
    report: reportData,
  });

  let auditScore: number | null = null;
  let auditScoreCard: AuditScorecard | null = null;

  try {
    const scoreData = await calculateSeniorFriendlinessScore(reportData, {
      isLiteVersion: auditResult.isLiteVersion,
    });
    auditScore = Number.isFinite(scoreData.finalScore) ? scoreData.finalScore : null;
    auditScoreCard = buildAuditScorecard(reportData, {
      pageUrl: link,
      isLiteVersion: auditResult.isLiteVersion,
    });
  } catch (error) {
    fullAuditLogger.warn('Failed to build scorecard for page audit.', {
      url: link,
      device,
      isLiteVersion: auditResult.isLiteVersion,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const persistentJsonPath = path.join(
    finalReportFolder,
    `report-${device}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
  );
  await fs.copyFile(auditResult.reportPath, persistentJsonPath);
  await fs.unlink(auditResult.reportPath).catch(() => undefined);

  return {
    jsonReportPath: persistentJsonPath,
    url: link,
    imagePaths: {},
    score: auditScore,
    scoreCard: auditScoreCard,
    isLiteVersion: auditResult.isLiteVersion,
  };
}

function shouldFallbackToLiteScanner(errorCode: string | undefined): boolean {
  return errorCode === 'SERVER_ERROR'
    || errorCode === 'REQUEST_TIMEOUT'
    || errorCode === 'SCAN_TIMEOUT'
    || errorCode === 'AUDIT_FAILED'
    || errorCode === 'SCANNER_SERVICE_ERROR'
    || errorCode === 'SCANNER_WORKER_FAILED'
    || errorCode === 'PYTHON_SCANNER_ERROR';
}

async function requestPageAuditWithFallback(
  link: string,
  device: FullAuditDevice,
  preferredMode: FullAuditScannerMode,
  options?: {
    isHomepage?: boolean;
    allowFullRetry?: boolean;
  },
): Promise<FullAuditPageScanResult> {
  if (preferredMode === 'lite') {
    const liteAttempt = await requestScannerAudit({
      url: link,
      device,
      format: 'json',
      includeReport: true,
      isLiteVersion: true,
    });

    return {
      ...liteAttempt,
      isLiteVersion: true,
      scanModeUsed: 'lite',
      shouldUseLiteForFuture: true,
    };
  }

  if (!options?.isHomepage) {
    const scannerLoad = await requestScannerLoadSnapshot();
    if (shouldPreferLiteScannerForLoad(scannerLoad, { isHomepage: options?.isHomepage })) {
      fullAuditLogger.warn('Using lite scanner for full-audit target because scanner backlog is high.', {
        url: link,
        device,
        scannerLoad,
      });

      const liteAttempt = await requestScannerAudit({
        url: link,
        device,
        format: 'json',
        includeReport: true,
        isLiteVersion: true,
      });

      return {
        ...liteAttempt,
        isLiteVersion: true,
        scanModeUsed: 'lite',
        shouldUseLiteForFuture: false,
        degradedReason: 'Scanner backlog was high, so this target used the lite scanner.',
      };
    }
  }

  const firstAttempt = await requestScannerAudit({
    url: link,
    device,
    format: 'json',
    includeReport: true,
  });

  if (firstAttempt.success) {
    return {
      ...firstAttempt,
      isLiteVersion: false,
      scanModeUsed: 'full',
      shouldUseLiteForFuture: false,
      fullFailureCountDelta: 0,
    };
  }

  fullAuditLogger.warn('Full-audit page scan failed on first attempt; retrying full scanner.', {
    url: link,
    device,
    errorCode: firstAttempt.errorCode,
    statusCode: firstAttempt.statusCode,
    error: firstAttempt.error,
  });

  if (!options?.allowFullRetry) {
    if (!shouldFallbackToLiteScanner(firstAttempt.errorCode)) {
      return {
        ...firstAttempt,
        isLiteVersion: false,
        scanModeUsed: 'full',
        shouldUseLiteForFuture: false,
        fullFailureCountDelta: 1,
      };
    }

    fullAuditLogger.warn('Skipping second full-scan attempt for non-homepage target; falling back to lite scanner.', {
      url: link,
      device,
    });

    const liteAttempt = await requestScannerAudit({
      url: link,
      device,
      format: 'json',
      includeReport: true,
      isLiteVersion: true,
    });

    if (liteAttempt.success) {
      return {
        ...liteAttempt,
        isLiteVersion: true,
        scanModeUsed: 'lite',
        shouldUseLiteForFuture: false,
        fullFailureCountDelta: 1,
        degradedReason: 'A non-homepage full scan failed, so it switched directly to lite mode to keep the audit fast.',
      };
    }

    return {
      ...liteAttempt,
      isLiteVersion: true,
      scanModeUsed: 'lite',
      shouldUseLiteForFuture: false,
      fullFailureCountDelta: 1,
      degradedReason: 'A non-homepage full scan failed, and its lite fallback also failed.',
    };
  }

  await sleep(1_500);

  const secondAttempt = await requestScannerAudit({
    url: link,
    device,
    format: 'json',
    includeReport: true,
  });

  if (secondAttempt.success) {
    fullAuditLogger.info('Full-audit page scan recovered on retry.', {
      url: link,
      device,
    });
    return {
      ...secondAttempt,
      isLiteVersion: false,
      scanModeUsed: 'full',
      shouldUseLiteForFuture: false,
      fullFailureCountDelta: 0,
    };
  }

  if (!shouldFallbackToLiteScanner(secondAttempt.errorCode)) {
    return {
      ...secondAttempt,
      isLiteVersion: false,
      scanModeUsed: 'full',
      shouldUseLiteForFuture: false,
      fullFailureCountDelta: 1,
    };
  }

  fullAuditLogger.warn('Falling back to lite scanner for full-audit page.', {
    url: link,
    device,
    errorCode: secondAttempt.errorCode,
    statusCode: secondAttempt.statusCode,
    error: secondAttempt.error,
  });

  const liteAttempt = await requestScannerAudit({
    url: link,
    device,
    format: 'json',
    includeReport: true,
    isLiteVersion: true,
  });

  if (liteAttempt.success) {
    fullAuditLogger.warn('Lite scanner fallback succeeded for full-audit page.', {
      url: link,
      device,
    });
    return {
      ...liteAttempt,
      isLiteVersion: true,
      scanModeUsed: 'lite',
      shouldUseLiteForFuture: true,
      fullFailureCountDelta: 1,
      degradedReason: 'Full scanner failed repeatedly, so the target fell back to lite mode.',
    };
  }

  return {
    ...liteAttempt,
    isLiteVersion: true,
    scanModeUsed: 'lite',
    shouldUseLiteForFuture: true,
    fullFailureCountDelta: 1,
    degradedReason: 'Full scanner failed repeatedly, and lite fallback also failed.',
  };
}

function addAuditWarning(warnings: Set<string>, message: string | undefined): void {
  if (!message) {
    return;
  }

  const normalized = String(message).trim();
  if (normalized) {
    warnings.add(normalized);
  }
}

function buildFailedTargetResult(
  target: { url: string; isHomepage: boolean },
  device: FullAuditDevice,
  scanModeUsed: FullAuditScannerMode,
  error: string,
  options?: {
    errorCode?: string;
    statusCode?: number;
  },
): FullAuditTargetResult {
  return {
    url: target.url,
    device,
    isHomepage: target.isHomepage,
    scanModeUsed,
    status: 'failed',
    failureReason: error,
    ...(options?.errorCode ? { errorCode: options.errorCode } : {}),
    ...(typeof options?.statusCode === 'number' ? { statusCode: options.statusCode } : {}),
  };
}

function applyExecutionSummary(
  record: AnalysisRecordDocument,
  summary: FullAuditExecutionSummary,
  scanTargets: FullAuditTargetResult[],
): void {
  record.plannedTargetCount = summary.plannedTargetCount;
  record.successfulTargetCount = summary.successfulTargetCount;
  record.degradedTargetCount = summary.degradedTargetCount;
  record.failedTargetCount = summary.failedTargetCount;
  record.warnings = [...summary.warnings];
  record.scanTargets = scanTargets;
}

function applyCachedCompletedAuditSnapshot(
  record: AnalysisRecordDocument,
  snapshot: CachedCompletedFullAuditSnapshot,
): void {
  record.status = snapshot.status;
  record.score = snapshot.score;
  record.scoreCard = snapshot.scoreCard;
  record.aiReport = snapshot.aiReport;
  record.attachmentCount = snapshot.attachmentCount;
  record.reportDirectory = snapshot.reportDirectory;
  record.reportStorage = snapshot.reportStorage;
  record.reportFiles = snapshot.reportFiles;
  record.emailStatus = 'sent';
  record.emailError = undefined;
  record.failureReason = undefined;
  record.plannedTargetCount = snapshot.plannedTargetCount;
  record.successfulTargetCount = snapshot.successfulTargetCount;
  record.degradedTargetCount = snapshot.degradedTargetCount;
  record.failedTargetCount = snapshot.failedTargetCount;
  record.scanTargets = snapshot.scanTargets as AnalysisRecordDocument['scanTargets'];
  record.warnings = [
    ...snapshot.warnings,
    'Reused completed website audit results from the last 24 hours.',
    'AI summary and PDF generation were skipped because cached website results were reused.',
  ];
}

async function generatePlatformReports(
  reportsByPlatform: Partial<Record<FullAuditDevice, FullAuditReportEntry[]>>,
  email: string,
  planId: string,
  finalReportFolder: string,
): Promise<void> {
  for (const [deviceKey, reports] of Object.entries(reportsByPlatform)) {
    const device = deviceKey as FullAuditDevice;
    if (!reports || reports.length === 0) {
      continue;
    }

    const individualPdfPaths: string[] = [];
    for (const report of reports) {
      try {
        await new Promise<void>((resolve) => setImmediate(resolve));
        if (report.isLiteVersion && planId !== 'pro' && planId !== 'onetime') {
          const litePdfResult = await generateLiteAccessibilityReport(report.jsonReportPath, finalReportFolder);
          const expectedPdfPath = path.join(finalReportFolder, buildFullAuditPdfFileName(report.url, device));

          if (litePdfResult?.reportPath) {
            if (litePdfResult.reportPath !== expectedPdfPath) {
              await fs.copyFile(litePdfResult.reportPath, expectedPdfPath);
              await fs.unlink(litePdfResult.reportPath).catch(() => undefined);
            }

            individualPdfPaths.push(expectedPdfPath);
          }
          continue;
        }

        const seniorPdfResult = await generateSeniorAccessibilityReport({
          inputFile: report.jsonReportPath,
          url: report.url,
          email_address: email,
          device,
          imagePaths: report.imagePaths,
          outputDir: finalReportFolder,
          formFactor: device,
          planType: planId,
        });

        if (seniorPdfResult?.reportPath) {
          individualPdfPaths.push(seniorPdfResult.reportPath);
        }
      } catch (error) {
        fullAuditLogger.error('Failed to generate individual PDF.', {
          url: report.url,
          device,
          isLiteVersion: Boolean(report.isLiteVersion),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (individualPdfPaths.length > 0) {
      try {
        await mergePDFsByPlatform({
          pdfPaths: individualPdfPaths,
          device,
          email_address: email,
          outputDir: finalReportFolder,
          reports,
          planType: planId,
        });
      } catch (mergeError) {
        fullAuditLogger.warn('Combined PDF merge failed. Falling back to summary PDF.', {
          device,
          error: mergeError instanceof Error ? mergeError.message : String(mergeError),
        });

        await generateCombinedPlatformReport({
          reports,
          device,
          email_address: email,
          outputDir: finalReportFolder,
          planType: planId,
          individualPdfPaths,
        }).catch((summaryError) => {
          fullAuditLogger.error('Fallback combined platform PDF generation failed.', {
            device,
            error: summaryError instanceof Error ? summaryError.message : String(summaryError),
          });
        });
      }
    }

    for (const report of reports) {
      if (report.jsonReportPath.startsWith(finalReportFolder)) {
        await fs.unlink(report.jsonReportPath).catch(() => undefined);
      }
    }
  }
}

function buildPlatformSummary(reportsByPlatform: Partial<Record<FullAuditDevice, FullAuditReportEntry[]>>): Array<{ platform: string; score: number | null }> {
  return Object.entries(reportsByPlatform).map(([deviceKey, reports]) => {
    const scores = (reports || [])
      .map((entry) => entry.score)
      .filter((score): score is number => score !== null && score !== undefined);

    const averageScore = scores.length > 0
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : null;

    return {
      platform: deviceKey.charAt(0).toUpperCase() + deviceKey.slice(1),
      score: averageScore,
    };
  });
}

async function persistAggregateScorecard(
  record: AnalysisRecordDocument,
  reportsByPlatform: Partial<Record<FullAuditDevice, FullAuditReportEntry[]>>,
): Promise<void> {
  const platformScorecards: AuditPlatformScore[] = [];
  const allScorecards: AuditScorecard[] = [];

  for (const [deviceKey, reports] of Object.entries(reportsByPlatform)) {
    const device = deviceKey as FullAuditDevice;
    const deviceScorecards = (reports || [])
      .map((report) => report.scoreCard)
      .filter((scoreCard): scoreCard is AuditScorecard => Boolean(scoreCard));

    allScorecards.push(...deviceScorecards);

    if (deviceScorecards.length > 0) {
      const deviceAggregate = buildAggregateAuditScorecard(deviceScorecards, {
        pageCount: deviceScorecards.length,
      });

      platformScorecards.push({
        key: device,
        label: device.charAt(0).toUpperCase() + device.slice(1),
        score: deviceAggregate.overallScore,
        pageCount: deviceScorecards.length,
      });
    }
  }

  if (allScorecards.length === 0) {
    return;
  }

  const aggregateScorecard = buildAggregateAuditScorecard(allScorecards, {
    pageCount: allScorecards.length,
    platforms: platformScorecards,
  });

  record.score = aggregateScorecard.overallScore;
  record.scoreCard = aggregateScorecard;
  await record.save().catch((error) => {
    fullAuditLogger.warn('Failed to persist aggregate full-audit scorecard.', {
      taskId: record.taskId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

async function sendAuditEmail(
  email: string,
  planId: string,
  selectedDevice: string | null | undefined,
  finalReportFolder: string,
): Promise<FullAuditEmailResult> {
  const emailContent = buildFullAuditEmailContent(planId, selectedDevice);

  return Promise.race([
    sendAuditReportEmail({
      to: email,
      subject: emailContent.subject,
      text: emailContent.text,
      folderPath: finalReportFolder,
      deviceFilter: emailContent.deviceFilter,
    }),
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error('Email sending timed out after 5 minutes')), 300_000);
    }),
  ]);
}

async function maybeSendSealOfApproval(email: string, url: string, planId: string): Promise<void> {
  if (planId !== 'pro') {
    return;
  }

  const resultsFile = buildSealResultsFilePath(email, url);
  let urlScores: Array<{ Url?: string; score?: number | string }> = [];

  try {
    const fileContent = await fs.readFile(resultsFile, 'utf8');
    urlScores = JSON.parse(fileContent) as Array<{ Url?: string; score?: number | string }>;
  } catch (error) {
    fullAuditLogger.warn('Could not read results.json for threshold check.', {
      email,
      url,
      resultsFile,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const result = checkScoreThreshold(urlScores, 80, { verbose: true });
  if (!result.pass) {
    return;
  }

  const sealPath = resolveBackendPath('assets', 'silversurfers-seal.png');
  try {
    await fs.access(sealPath);
  } catch {
    fullAuditLogger.warn('Seal image is missing, skipping seal email.', {
      sealPath,
    });
    return;
  }

  await sendDirectMail({
    to: email,
    subject: 'SilverSurfers Seal of Approval - Congratulations!',
    html: `
      <div style="font-family: Arial,sans-serif;background:#f7f7fb;padding:24px;">
        <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <div style="padding:20px 24px;border-bottom:1px solid #eef2f7;background:linear-gradient(135deg,#059669 0%,#2563eb 100%);color:#fff;">
            <h1 style="margin:0;font-size:20px;">SilverSurfers Seal of Approval</h1>
          </div>
          <div style="padding:24px;color:#111827;">
            <p style="margin:0 0 12px 0;line-height:1.6;">Congrats! Your site passed our senior accessibility threshold.</p>
            <p style="margin:0 0 16px 0;line-height:1.6;">As a Pro subscriber, you've earned the SilverSurfers Seal. You can display this seal on your website.</p>
            <p style="margin:0 0 12px 0;line-height:1.6;">Guidelines: Place on pages that meet the accessibility bar; link to your latest report if you like.</p>
          </div>
        </div>
      </div>`,
    attachments: [
      {
        filename: 'silversurfers-seal.png',
        path: sealPath,
        contentType: 'image/png',
      },
    ],
  });
}

async function updateUsageCounters(record: AnalysisRecordDocument): Promise<void> {
  if (!record.user) {
    return;
  }

  const Subscription = await getSubscriptionModel();

  if (record.status === 'failed') {
    await Subscription.findOneAndUpdate(
      { user: record.user, status: { $in: ['active', 'trialing'] } },
      { $inc: { 'usage.scansThisMonth': -1 } },
    ).catch((error) => {
      fullAuditLogger.warn('Failed to decrement usage counter for failed scan.', {
        taskId: record.taskId,
        userId: record.user,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    return;
  }

  if (record.status === 'completed' || record.status === 'completed_with_warnings') {
    await Subscription.findOneAndUpdate(
      { user: record.user, status: { $in: ['active', 'trialing'] } },
      { $inc: { 'usage.totalScans': 1 } },
    ).catch((error) => {
      fullAuditLogger.warn('Failed to increment total scans for completed audit.', {
        taskId: record.taskId,
        userId: record.user,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}

export async function runFullAuditProcess(payload: QueueJobInput): Promise<QueueResult> {
  const job = toFullAuditJobPayload(payload);
  const fullName = [job.firstName, job.lastName].filter(Boolean).join(' ') || 'Valued Customer';

  const effectivePlanId = await resolveEffectivePlanId(job.planId, job.subscriptionId);
  const effectiveTaskId = job.taskId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const finalReportFolder = resolveBackendPath(
    'reports-full',
    sanitizePathSegment(job.email),
    `${effectiveTaskId}-${sanitizePathSegment(job.url, 50)}`,
  );
  const jobFolder = resolveBackendPath('reports', `${sanitizePathSegment(job.email)}-${Date.now()}`);

  let record: AnalysisRecordDocument | undefined;

  fullAuditLogger.info('Starting full audit job.', {
    email: job.email,
    url: job.url,
    taskId: effectiveTaskId,
    planId: effectivePlanId,
    selectedDevice: job.selectedDevice,
    fullName,
  });

  await fs.rm(finalReportFolder, { recursive: true, force: true }).catch(() => undefined);
  await fs.mkdir(finalReportFolder, { recursive: true });
  await fs.mkdir(jobFolder, { recursive: true });

  try {
    record = await findOrCreateAnalysisRecord(
      { ...job, taskId: effectiveTaskId },
      effectivePlanId,
      finalReportFolder,
    );

    const reusableAuditSnapshot = await getCachedCompletedFullAuditSnapshot({
      websiteUrl: job.url,
      planId: effectivePlanId,
      selectedDevice: job.selectedDevice,
      totalPageLimit: env.fullAuditTotalPageLimit,
      priorityPageLimit: env.fullAuditPriorityPageLimit,
      fullModePageLimit: env.fullAuditFullModePageLimit,
    });

    if (reusableAuditSnapshot) {
      applyCachedCompletedAuditSnapshot(record, reusableAuditSnapshot);
      await updateUsageCounters(record);
      await record.save().catch((error) => {
        fullAuditLogger.warn('Failed to persist reused completed audit snapshot.', {
          taskId: effectiveTaskId,
          error: error instanceof Error ? error.message : String(error),
        });
      });

      fullAuditLogger.info('Reused completed full audit from 24-hour cache.', {
        email: job.email,
        url: job.url,
        taskId: effectiveTaskId,
        sourceTaskId: reusableAuditSnapshot.sourceTaskId,
        cachedAt: reusableAuditSnapshot.cachedAt,
        status: reusableAuditSnapshot.status,
      });

      return {
        emailStatus: record.emailStatus || 'sent',
        attachmentCount: record.attachmentCount || 0,
        reportDirectory: record.reportDirectory || finalReportFolder,
        reportStorage: record.reportStorage,
        scansUsed: 1,
      };
    }

    const linksToAudit = await extractLinksToAudit(job.url);
    const targetPages = selectFullAuditTargetPages(job.url, linksToAudit, {
      totalPageLimit: env.fullAuditTotalPageLimit,
      priorityPageLimit: env.fullAuditPriorityPageLimit,
    });
    const fullModePageLimit = effectivePlanId === 'pro' || effectivePlanId === 'onetime'
      ? targetPages.length
      : env.fullAuditFullModePageLimit;

    const plannedTargetPages = planFullAuditTargetPages(targetPages, {
      fullModePageLimit,
    });
    const devicesToAudit = resolveDevicesToAudit(effectivePlanId, job.selectedDevice);
    const reportsByPlatform: Partial<Record<FullAuditDevice, FullAuditReportEntry[]>> = {};
    const scanTargets: FullAuditTargetResult[] = [];
    const warningSet = new Set<string>();
    let successfulTargetCount = 0;
    let degradedTargetCount = 0;
    let failedTargetCount = 0;
    let globalFullFailureCount = 0;
    let forceLiteForRemainingNonHomepage = false;
    let processedTargetCount = 0;
    const deviceFullFailureCounts = devicesToAudit.reduce<Record<FullAuditDevice, number>>((accumulator, device) => {
      accumulator[device] = 0;
      return accumulator;
    }, {} as Record<FullAuditDevice, number>);
    const deviceScanModes = devicesToAudit.reduce<Record<FullAuditDevice, FullAuditScannerMode>>((accumulator, device) => {
      accumulator[device] = 'full';
      return accumulator;
    }, {} as Record<FullAuditDevice, FullAuditScannerMode>);

    fullAuditLogger.info('Resolved pages and devices for full audit.', {
      email: job.email,
      taskId: effectiveTaskId,
      discoveredPageCount: linksToAudit.length,
      selectedPageCount: plannedTargetPages.length,
      selectedPages: plannedTargetPages.map((page) => ({
        url: page.url,
        priorityBucket: page.priorityBucket,
        preferredScanMode: page.preferredScanMode,
      })),
      devices: devicesToAudit,
      crawlScope: {
        maxPages: env.fullAuditMaxPages,
        maxDepth: env.fullAuditMaxDepth,
        delayMs: env.fullAuditCrawlDelayMs,
        timeoutMs: env.fullAuditCrawlTimeoutMs,
        maxRetries: env.fullAuditCrawlMaxRetries,
      },
    });

    if (plannedTargetPages.length === 0) {
      throw new Error('No auditable pages were found for the full audit.');
    }

    const plannedLitePageCount = plannedTargetPages.filter((page) => page.preferredScanMode === 'lite').length;
    if (plannedLitePageCount > 0) {
      addAuditWarning(
        warningSet,
        `To keep the audit faster, ${plannedLitePageCount} lower-priority page(s) were scheduled in lite mode from the start.`,
      );
    }

    for (const targetPage of plannedTargetPages) {
      for (const device of devicesToAudit) {
        const preferredMode = targetPage.preferredScanMode === 'lite'
          ? 'lite'
          : (!targetPage.isHomepage && forceLiteForRemainingNonHomepage)
          ? 'lite'
          : deviceScanModes[device];
        const cachedPageResult = await getCachedFullAuditPageReport({
          websiteUrl: job.url,
          pageUrl: targetPage.url,
          device,
        }).catch(() => null);

        const pageScanResult = cachedPageResult
          ? await materializeCachedFullAuditPageReport(cachedPageResult)
            .then((reportPath) => {
              fullAuditLogger.info('Reusing cached full-audit page result from Redis.', {
                taskId: effectiveTaskId,
                websiteUrl: job.url,
                url: targetPage.url,
                device,
                cachedAt: cachedPageResult.cachedAt,
                isLiteVersion: cachedPageResult.isLiteVersion,
              });

              return {
                success: true,
                reportPath,
                isLiteVersion: cachedPageResult.isLiteVersion,
                scanModeUsed: cachedPageResult.isLiteVersion ? 'lite' : 'full',
                shouldUseLiteForFuture: cachedPageResult.isLiteVersion,
                degradedReason: cachedPageResult.isLiteVersion
                  ? 'A cached lite page scan from the last 24 hours was reused.'
                  : undefined,
                fromCache: true,
              } satisfies FullAuditPageScanResult;
            })
            .catch((error) => {
              fullAuditLogger.warn('Failed to materialize cached page audit report. Falling back to live scan.', {
                taskId: effectiveTaskId,
                websiteUrl: job.url,
                url: targetPage.url,
                device,
                error: error instanceof Error ? error.message : String(error),
              });
              return null;
            })
          : null;

        let resolvedPageScanResult = pageScanResult;
        if (!resolvedPageScanResult) {
          if (processedTargetCount > 0 && env.fullAuditScannerCooldownMs > 0 && !cachedPageResult) {
            await sleep(env.fullAuditScannerCooldownMs);
          }

          resolvedPageScanResult = await requestPageAuditWithFallback(targetPage.url, device, preferredMode, {
            isHomepage: targetPage.isHomepage,
            allowFullRetry: targetPage.allowFullRetry,
          }).catch((error) => {
            fullAuditLogger.error('Unexpected error while auditing page.', {
              url: targetPage.url,
              device,
              mode: preferredMode,
              taskId: effectiveTaskId,
              error: error instanceof Error ? error.message : String(error),
            });
            return {
              success: false,
              isLiteVersion: preferredMode === 'lite',
              scanModeUsed: preferredMode,
              error: error instanceof Error ? error.message : String(error),
            } satisfies FullAuditPageScanResult;
          });
        }

        processedTargetCount += 1;

        if (resolvedPageScanResult.fullFailureCountDelta) {
          deviceFullFailureCounts[device] += resolvedPageScanResult.fullFailureCountDelta;
          globalFullFailureCount += resolvedPageScanResult.fullFailureCountDelta;
        }

        if (resolvedPageScanResult.fromCache) {
          addAuditWarning(warningSet, 'Some page scans were reused from the last 24 hours of Redis cache.');
        }

        if (resolvedPageScanResult.degradedReason) {
          addAuditWarning(warningSet, resolvedPageScanResult.degradedReason);
        }

        if (resolvedPageScanResult.shouldUseLiteForFuture && deviceScanModes[device] !== 'lite') {
          deviceScanModes[device] = 'lite';
          fullAuditLogger.warn('Switching full audit device to lite scanner mode for remaining pages.', {
            taskId: effectiveTaskId,
            device,
            url: targetPage.url,
          });
          addAuditWarning(
            warningSet,
            `Full scanner became unstable on ${device}, so remaining ${device} pages were scanned in lite mode.`,
          );
        }

        if (deviceFullFailureCounts[device] >= env.fullAuditMaxFullFailuresPerDevice && deviceScanModes[device] !== 'lite') {
          deviceScanModes[device] = 'lite';
          addAuditWarning(
            warningSet,
            `The ${device} device exceeded the full-scan failure budget, so remaining ${device} pages were scanned in lite mode.`,
          );
        }

        if (!forceLiteForRemainingNonHomepage && globalFullFailureCount >= env.fullAuditMaxFullFailuresPerAudit) {
          forceLiteForRemainingNonHomepage = true;
          addAuditWarning(
            warningSet,
            'The overall full-scan failure budget was exceeded, so remaining non-homepage pages were scanned in lite mode.',
          );
        }

        const reportEntry = await auditLinkForDevice(job.url, targetPage.url, device, finalReportFolder, resolvedPageScanResult).catch((error) => {
          fullAuditLogger.error('Unexpected error while persisting page audit.', {
            url: targetPage.url,
            device,
            mode: deviceScanModes[device],
            taskId: effectiveTaskId,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        });

        if (!reportEntry) {
          failedTargetCount += 1;
          scanTargets.push(buildFailedTargetResult(
            targetPage,
            device,
            resolvedPageScanResult.scanModeUsed,
            resolvedPageScanResult.error || 'Page scan did not produce a usable report.',
            {
              errorCode: resolvedPageScanResult.errorCode,
              statusCode: resolvedPageScanResult.statusCode,
            },
          ));
          addAuditWarning(warningSet, 'One or more page/device targets failed and were omitted from the final report package.');
          continue;
        }

        successfulTargetCount += 1;
        if (resolvedPageScanResult.scanModeUsed === 'lite') {
          degradedTargetCount += 1;
        }

        scanTargets.push({
          url: targetPage.url,
          device,
          isHomepage: targetPage.isHomepage,
          scanModeUsed: resolvedPageScanResult.scanModeUsed,
          status: 'completed',
          score: reportEntry.score,
        });

        if (!reportsByPlatform[device]) {
          reportsByPlatform[device] = [];
        }

        reportsByPlatform[device]?.push(reportEntry);
      }
    }

    const executionSummary: FullAuditExecutionSummary = {
      plannedTargetCount: plannedTargetPages.length * devicesToAudit.length,
      successfulTargetCount,
      degradedTargetCount,
      failedTargetCount,
      warnings: [...warningSet],
    };
    applyExecutionSummary(record, executionSummary, scanTargets);

    if (successfulTargetCount <= 0) {
      record.status = 'failed';
      record.emailStatus = 'failed';
      record.failureReason = 'Full audit failed to produce any usable page/device results.';
      record.emailError = 'Email delivery was skipped because the audit produced no usable results.';
      await updateUsageCounters(record);
      await record.save().catch((error) => {
        fullAuditLogger.warn('Failed to persist no-results full-audit outcome.', {
          taskId: effectiveTaskId,
          error: error instanceof Error ? error.message : String(error),
        });
      });

      return {
        emailStatus: record.emailStatus || 'failed',
        attachmentCount: 0,
        reportDirectory: record.reportDirectory || finalReportFolder,
        scansUsed: 1,
      };
    }

    await generatePlatformReports(reportsByPlatform, job.email, effectivePlanId, finalReportFolder);
    await persistAggregateScorecard(record, reportsByPlatform);

    if (record.scoreCard) {
      const remediationRoadmap = buildRemediationRoadmap(record.scoreCard);
      const aiReport = await generateAuditAiReport({
        url: job.url,
        fullName,
        scorecard: record.scoreCard,
        remediationRoadmap,
      });

      record.aiReport = aiReport;

      const aiSummaryFilename = effectivePlanId === 'pro' || !job.selectedDevice
        ? 'ai-executive-summary.pdf'
        : `ai-executive-summary-${job.selectedDevice}.pdf`;

      await generateAuditAiSummaryPdf(aiReport, {
        url: job.url,
        outputPath: path.join(finalReportFolder, aiSummaryFilename),
        title: 'AI Executive Summary',
        scorecard: record.scoreCard,
      }).catch((error) => {
        fullAuditLogger.warn('Failed to generate AI executive summary PDF.', {
          taskId: effectiveTaskId,
          error: error instanceof Error ? error.message : String(error),
        });
      });

      await record.save().catch((error) => {
        fullAuditLogger.warn('Failed to persist AI executive summary on analysis record.', {
          taskId: effectiveTaskId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    const platformSummary = buildPlatformSummary(reportsByPlatform);
    if (platformSummary.length > 0) {
      const summaryPdfPath = path.join(finalReportFolder, 'audit-summary.pdf');
      await generateSummaryPDF(platformSummary, summaryPdfPath).catch((error) => {
        fullAuditLogger.warn('Failed to generate full-audit summary PDF.', {
          taskId: effectiveTaskId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    const attachmentsPreview = await collectAttachmentsRecursive(finalReportFolder).catch((error) => {
      fullAuditLogger.warn('Failed to collect full-audit attachments preview.', {
        taskId: effectiveTaskId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [] as ReportAttachment[];
    });

    record.attachmentCount = Array.isArray(attachmentsPreview) ? attachmentsPreview.length : 0;
    record.reportFiles = buildStoredReportFilesFromAttachments(Array.isArray(attachmentsPreview) ? attachmentsPreview : []);
    const baseStatus = resolveFullAuditCompletionStatus(executionSummary);

    if (record.attachmentCount > 0) {
      record.emailStatus = 'sending';
      await record.save().catch((error) => {
        fullAuditLogger.warn('Failed to persist full-audit attachment preview metadata.', {
          taskId: effectiveTaskId,
          error: error instanceof Error ? error.message : String(error),
        });
      });

      const sendResult = await sendAuditEmail(job.email, effectivePlanId, job.selectedDevice, finalReportFolder)
        .catch((error) => ({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }));

      if ('success' in sendResult && sendResult.success) {
        await sleep(10_000);
        applyFullAuditEmailResult(record, sendResult as FullAuditEmailResult, finalReportFolder);
        record.reportFiles = mergeStoredReportFilesWithStorage(
          buildStoredReportFilesFromAttachments(Array.isArray(attachmentsPreview) ? attachmentsPreview : []),
          (sendResult as FullAuditEmailResult).storage,
        );

        const storageWarnings = (sendResult as FullAuditEmailResult).storageErrors || [];
        if (storageWarnings.length > 0) {
          addAuditWarning(warningSet, `Report storage completed with warnings: ${storageWarnings.join(' | ')}`);
        }
      } else {
        const emailFailureMessage = (sendResult as { error?: string }).error || 'Email delivery failed';
        record.emailStatus = 'failed';
        record.emailError = emailFailureMessage;
        addAuditWarning(warningSet, `Email delivery failed: ${emailFailureMessage}`);
      }
    } else {
      record.emailStatus = 'failed';
      record.emailError = 'Email delivery was skipped because no PDF report files were generated.';
      addAuditWarning(warningSet, 'PDF report generation produced no files, so email delivery was skipped.');
    }

    executionSummary.warnings = [...warningSet];
    applyExecutionSummary(record, executionSummary, scanTargets);
    record.status = resolveFullAuditCompletionStatus(executionSummary);
    if (baseStatus === 'completed' && record.status === 'completed_with_warnings' && !record.failureReason) {
      record.failureReason = undefined;
    }
    if (record.status !== 'failed') {
      record.failureReason = undefined;
    }

    await updateUsageCounters(record);
    await record.save().catch((error) => {
      fullAuditLogger.warn('Failed to persist final full-audit record state.', {
        taskId: effectiveTaskId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    if (record.status === 'completed' || record.status === 'completed_with_warnings') {
      await setCachedCompletedFullAuditSnapshot({
        websiteUrl: job.url,
        planId: effectivePlanId,
        selectedDevice: job.selectedDevice,
        totalPageLimit: env.fullAuditTotalPageLimit,
        priorityPageLimit: env.fullAuditPriorityPageLimit,
        fullModePageLimit: env.fullAuditFullModePageLimit,
        status: record.status as 'completed' | 'completed_with_warnings',
        cachedAt: new Date().toISOString(),
        sourceTaskId: record.taskId,
        score: record.score,
        scoreCard: record.scoreCard,
        aiReport: record.aiReport,
        warnings: Array.isArray(record.warnings) ? record.warnings : [],
        plannedTargetCount: Number(record.plannedTargetCount || 0),
        successfulTargetCount: Number(record.successfulTargetCount || 0),
        degradedTargetCount: Number(record.degradedTargetCount || 0),
        failedTargetCount: Number(record.failedTargetCount || 0),
        scanTargets: Array.isArray(record.scanTargets) ? record.scanTargets as Array<Record<string, unknown>> : [],
        attachmentCount: Number(record.attachmentCount || 0),
        reportDirectory: record.reportDirectory,
        reportStorage: record.reportStorage,
        reportFiles: Array.isArray(record.reportFiles) ? record.reportFiles as StoredReportFile[] : [],
      });
    }

    if (record.status === 'completed') {
      await maybeSendSealOfApproval(job.email, job.url, effectivePlanId).catch((error) => {
        fullAuditLogger.warn('Failed to send seal of approval email.', {
          taskId: effectiveTaskId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    await cleanupLocalReportDirectoryWhenStored({
      reportDirectory: finalReportFolder,
      reportStorage: record.reportStorage,
      taskId: effectiveTaskId,
      source: 'full-audit',
    }).catch((cleanupError) => {
      fullAuditLogger.warn('Failed to remove local full-audit reports after S3 upload.', {
        taskId: effectiveTaskId,
        reportDirectory: finalReportFolder,
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      });
    });

    fullAuditLogger.info('Completed full audit job.', {
      email: job.email,
      url: job.url,
      taskId: effectiveTaskId,
      status: record.status,
      attachmentCount: record.attachmentCount,
      retainedReportFolder: record.reportStorage?.provider === 's3' ? undefined : finalReportFolder,
    });

    return {
      emailStatus: record.emailStatus || 'sent',
      attachmentCount: record.attachmentCount || 0,
      reportDirectory: record.reportDirectory || finalReportFolder,
      reportStorage: record.reportStorage,
      scansUsed: 1,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    fullAuditLogger.error('Full audit job failed.', {
      email: job.email,
      url: job.url,
      taskId: effectiveTaskId,
      error: message,
    });

    if (record) {
      record.status = 'failed';
      record.failureReason = message;
      await updateUsageCounters(record);
      await record.save().catch((saveError) => {
        fullAuditLogger.warn('Failed to persist full-audit failure state.', {
          taskId: effectiveTaskId,
          error: saveError instanceof Error ? saveError.message : String(saveError),
        });
      });
    }

    throw error instanceof Error ? error : new Error(message);
  } finally {
    await fs.rm(jobFolder, { recursive: true, force: true }).catch(() => undefined);
  }
}
