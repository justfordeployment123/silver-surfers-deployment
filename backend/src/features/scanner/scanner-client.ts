import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { env } from '../../config/env.ts';
import { logger } from '../../config/logger.ts';
import type { QueueReportStorage } from '../../infrastructure/queues/job-queue.ts';
import type { AuditAiReport } from '../audits/ai-reporting.ts';
import ScannerResult from '../../models/scanner-result.model.ts';
import { downloadS3Object } from '../storage/report-storage.ts';

const scannerClientLogger = logger.child('feature:scanner:client');

export interface ScannerServiceAuditRequest {
  url: string;
  device?: 'desktop' | 'mobile' | 'tablet';
  format?: 'json' | 'html';
  isLiteVersion?: boolean;
  includeReport?: boolean;
  scannerQueue?: 'quick' | 'full';
  scannerJobId?: string;
  scannerTier?: 'aws' | 'vps';
}

export interface ScannerFullAuditBatchTarget {
  url: string;
  device: 'desktop' | 'mobile' | 'tablet';
  preferredScanMode: 'full' | 'lite';
  isHomepage?: boolean;
  allowFullRetry?: boolean;
}

export interface ScannerFullAuditOrchestrationRequest {
  url: string;
  devices: Array<'desktop' | 'mobile' | 'tablet'>;
  crawlScope: {
    maxPages: number;
    maxDepth: number;
    delayMs: number;
    timeoutMs: number;
    maxRetries: number;
    totalPageLimit: number;
    priorityPageLimit: number;
    fullModePageLimit: number;
  };
}

export interface ScannerFullAuditBatchRequest {
  scannerJobId?: string;
  scannerTier?: 'aws' | 'vps';
  targets?: ScannerFullAuditBatchTarget[];
  orchestration?: ScannerFullAuditOrchestrationRequest;
  reportGeneration?: {
    enabled?: boolean;
    email?: string;
    taskId?: string;
    url?: string;
    planId?: string;
    selectedDevice?: string | null;
    fullName?: string;
  };
}

interface ScannerServiceAuditPayload {
  success?: boolean;
  reportPath?: string;
  report?: Record<string, unknown>;
  isLiteVersion?: boolean;
  version?: 'Lite' | 'Full';
  url?: string;
  device?: 'desktop' | 'mobile' | 'tablet';
  strategy?: string;
  attemptNumber?: number;
  message?: string;
  error?: string;
  errorCode?: string;
  details?: {
    stderr?: string;
    stdout?: string;
    error?: string;
  };
}

export interface ScannerSqsResultPayload {
  schemaVersion?: number;
  jobType?: string;
  scannerJobId?: string;
  success?: boolean;
  report?: {
    bucket?: string;
    region?: string;
    key?: string;
  };
  isLiteVersion?: boolean;
  version?: 'Lite' | 'Full';
  url?: string;
  device?: 'desktop' | 'mobile' | 'tablet';
  strategy?: string;
  attemptNumber?: number;
  message?: string;
  error?: string;
  errorCode?: string;
  reportStorage?: QueueReportStorage;
  reportsGeneratedInWorker?: boolean;
  aiReport?: AuditAiReport;
  scannerTier?: 'aws' | 'vps';
  originalScannerJobId?: string;
}

interface ScannerFullAuditBatchArtifactTarget {
  url?: string;
  device?: 'desktop' | 'mobile' | 'tablet';
  success?: boolean;
  report?: Record<string, unknown>;
  isLiteVersion?: boolean;
  scanModeUsed?: 'full' | 'lite';
  shouldUseLiteForFuture?: boolean;
  fullFailureCountDelta?: number;
  degradedReason?: string;
  error?: string;
  errorCode?: string;
  statusCode?: number;
  originalError?: string;
}

interface ScannerFullAuditBatchArtifact {
  schemaVersion?: number;
  jobType?: string;
  scannerJobId?: string;
  targets?: ScannerFullAuditBatchArtifactTarget[];
}

export interface ScannerServiceAuditSuccess {
  success: true;
  reportPath: string;
  report?: Record<string, unknown>;
  isLiteVersion: boolean;
  version: 'Lite' | 'Full';
  url: string;
  device: 'desktop' | 'mobile' | 'tablet';
  strategy: string;
  attemptNumber: number;
  message: string;
}

export interface ScannerServiceAuditFailure {
  success: false;
  error: string;
  errorCode: string;
  statusCode?: number;
  originalError?: string;
}

export type ScannerServiceAuditResult = ScannerServiceAuditSuccess | ScannerServiceAuditFailure;

export interface ScannerSqsDispatchSuccess {
  success: true;
  scannerJobId: string;
  queueKind: 'quick' | 'full';
  jobQueueUrl: string;
  resultQueueUrl: string;
  scannerTier: 'aws' | 'vps';
}

export type ScannerSqsDispatchResult = ScannerSqsDispatchSuccess | ScannerServiceAuditFailure;

export interface ScannerFullAuditBatchTargetSuccess {
  success: true;
  url: string;
  device: 'desktop' | 'mobile' | 'tablet';
  reportPath: string;
  isLiteVersion: boolean;
  scanModeUsed: 'full' | 'lite';
  shouldUseLiteForFuture?: boolean;
  fullFailureCountDelta?: number;
  degradedReason?: string;
}

export interface ScannerFullAuditBatchTargetFailure {
  success: false;
  url: string;
  device: 'desktop' | 'mobile' | 'tablet';
  isLiteVersion: boolean;
  scanModeUsed: 'full' | 'lite';
  shouldUseLiteForFuture?: boolean;
  fullFailureCountDelta?: number;
  degradedReason?: string;
  error: string;
  errorCode?: string;
  statusCode?: number;
  originalError?: string;
}

export type ScannerFullAuditBatchTargetResult = ScannerFullAuditBatchTargetSuccess | ScannerFullAuditBatchTargetFailure;

export type ScannerFullAuditBatchResult = {
  success: true;
  scannerJobId: string;
  targets: ScannerFullAuditBatchTargetResult[];
  reportStorage?: QueueReportStorage;
  reportsGeneratedInWorker?: boolean;
  aiReport?: AuditAiReport;
} | ScannerServiceAuditFailure;

export type ScannerFullAuditBatchDispatchResult = {
  success: true;
  scannerJobId: string;
  jobQueueUrl: string;
  resultQueueUrl: string;
  targetCount: number;
  scannerTier: 'aws' | 'vps';
} | ScannerServiceAuditFailure;

export interface ScannerServiceLoadSnapshot {
  activeAudits: number;
  queuedAudits: number;
  maxConcurrentAudits: number;
  maxQueuedAudits: number;
  browserPoolSize?: number;
  browsersInUse?: number;
  browserWaiters?: number;
}

function buildTimeoutMs(isLiteVersion: boolean): number {
  return isLiteVersion ? env.scannerLiteAuditTimeoutMs : env.scannerFullAuditTimeoutMs;
}

export function createScannerJobId(): string {
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function resolveScannerQueueKind(request: ScannerServiceAuditRequest): 'quick' | 'full' {
  if (request.scannerQueue === 'quick' || request.scannerQueue === 'full') {
    return request.scannerQueue;
  }

  return request.isLiteVersion ? 'quick' : 'full';
}

function resolveScannerTier(value: unknown): 'aws' | 'vps' {
  return value === 'vps' ? 'vps' : 'aws';
}

function resolveJobQueueUrl(queueKind: 'quick' | 'full', scannerTier: 'aws' | 'vps'): string | undefined {
  if (scannerTier === 'vps') {
    return queueKind === 'quick' ? env.scannerSqsVpsQuickJobQueueUrl : env.scannerSqsVpsFullJobQueueUrl;
  }

  return queueKind === 'quick' ? env.scannerSqsQuickJobQueueUrl : env.scannerSqsFullJobQueueUrl;
}

export function isScannerFailureEligibleForVpsFallback(payload: {
  success?: boolean;
  error?: string;
  errorCode?: string;
  scannerTier?: string;
}): boolean {
  if (payload.success || payload.scannerTier === 'vps') {
    return false;
  }

  const errorCode = String(payload.errorCode || '').toUpperCase();
  const errorText = String(payload.error || '');
  const combined = `${errorCode}\n${errorText}`;

  if (/DNS|ENOTFOUND|NXDOMAIN|INVALID_URL|NOT_FOUND|HTTP_404|CERT|SSL|TLS|CONNECTION_REFUSED/i.test(combined)) {
    return false;
  }

  return /TIMEOUT|REQUEST_TIMEOUT|SCAN_TIMEOUT|PAGE\.GOTO|TARGETCLOSED|TARGET PAGE|BROWSER HAS BEEN CLOSED|NS_ERROR_NET_RESET|NS_ERROR_NET_INTERRUPT|NETWORK_INTERRUPTED|ERR_CONNECTION_RESET|NAVIGATION|LOAD EVENT|SCANNER_WORKER_FAILED|SERVICE_UNAVAILABLE/i.test(combined);
}

function resolveReportHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/\./g, '-') || 'report';
  } catch {
    return url.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'report';
  }
}

function extractNestedErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const candidate = error as {
    code?: string;
    cause?: {
      code?: string;
    };
  };

  return candidate.code ?? candidate.cause?.code;
}

function buildBrowserErrorResponse(statusCode: number, detailText: string): ScannerServiceAuditFailure {
  if (/chrome_path|chromium_path|chrome\/chromium executable|unable to locate a chrome\/chromium executable/i.test(detailText)) {
    return {
      success: false,
      error: 'The scanner service browser is not configured correctly. Please contact support.',
      errorCode: 'SCANNER_BROWSER_UNAVAILABLE',
      statusCode,
      ...(detailText ? { originalError: detailText } : {}),
    };
  }

  if (/chrome launch failed|chrome executable not found|chrome executable is not accessible/i.test(detailText)) {
    return {
      success: false,
      error: 'The scanner service could not launch its browser. Please try again later or contact support.',
      errorCode: 'SCANNER_BROWSER_LAUNCH_FAILED',
      statusCode,
      ...(detailText ? { originalError: detailText } : {}),
    };
  }

  return {
    success: false,
    error: `The scanner service encountered an internal error (${statusCode}). Please try again later.`,
    errorCode: 'SERVER_ERROR',
    statusCode,
    ...(detailText ? { originalError: detailText } : {}),
  };
}

function mapScannerFailure(
  statusCode: number | undefined,
  payload: ScannerServiceAuditPayload | undefined,
  timeoutMinutes: number,
): ScannerServiceAuditFailure {
  if (statusCode === 504) {
    return {
      success: false,
      error: `The website scan timed out after ${timeoutMinutes} minutes. The website may be slow to load or the scanner service is experiencing high load. Please try again in a few moments.`,
      errorCode: 'SCAN_TIMEOUT',
      statusCode,
    };
  }

  if (statusCode === 503) {
    return {
      success: false,
      error: 'The scanner service is temporarily unavailable. Please try again in a few moments.',
      errorCode: 'SERVICE_UNAVAILABLE',
      statusCode,
    };
  }

  if (statusCode && statusCode >= 500) {
    const detailText = [
      payload?.error,
      payload?.details?.stderr,
      payload?.details?.stdout,
      payload?.details?.error,
    ].filter(Boolean).join('\n');

    return buildBrowserErrorResponse(statusCode, detailText);
  }

  return {
    success: false,
    error: payload?.error || 'Scanner service failed.',
    errorCode: payload?.errorCode || 'SCANNER_SERVICE_ERROR',
    ...(payload?.error ? { originalError: payload.error } : {}),
    ...(statusCode ? { statusCode } : {}),
  };
}

async function resolveLocalReportPath(
  payload: ScannerServiceAuditPayload,
  request: ScannerServiceAuditRequest,
): Promise<string> {
  if (payload.reportPath) {
    const isAccessibleLocally = await fs.access(payload.reportPath).then(() => true).catch(() => false);
    if (isAccessibleLocally) {
      return payload.reportPath;
    }
  }

  if (!payload.report) {
    throw new Error('Scanner service did not return an accessible report path or inline report payload.');
  }

  const hostname = resolveReportHostname(request.url);
  const versionSuffix = request.isLiteVersion ? '-lite' : '';
  const tempPath = path.join(os.tmpdir(), `report-${hostname}-${Date.now()}${versionSuffix}.json`);
  await fs.writeFile(tempPath, JSON.stringify(payload.report, null, 2), 'utf8');
  return tempPath;
}

export async function loadSqsRuntime() {
  const moduleName = '@aws-sdk/client-sqs';
  const module = await import(moduleName) as Record<string, any>;
  return {
    SQSClient: module.SQSClient,
    SendMessageCommand: module.SendMessageCommand,
    ReceiveMessageCommand: module.ReceiveMessageCommand,
    DeleteMessageCommand: module.DeleteMessageCommand,
    ChangeMessageVisibilityCommand: module.ChangeMessageVisibilityCommand,
  };
}

export function parseSqsResultBody(body: string | undefined): ScannerSqsResultPayload | null {
  if (!body) {
    return null;
  }

  try {
    return JSON.parse(body) as ScannerSqsResultPayload;
  } catch {
    return null;
  }
}

export async function downloadScannerS3Report(
  payload: ScannerSqsResultPayload,
  request: ScannerServiceAuditRequest,
): Promise<string> {
  const bucket = payload.report?.bucket || env.scannerSqsArtifactBucket;
  const region = payload.report?.region || env.scannerSqsArtifactRegion;
  const key = payload.report?.key;

  if (!bucket || !region || !key) {
    throw new Error('Scanner SQS result did not include a usable S3 artifact reference.');
  }

  const downloaded = await downloadS3Object({ bucket, region, key });
  const hostname = resolveReportHostname(request.url);
  const versionSuffix = request.isLiteVersion ? '-lite' : '';
  const tempPath = path.join(os.tmpdir(), `scanner-sqs-${hostname}-${Date.now()}${versionSuffix}.json`);
  await fs.writeFile(tempPath, downloaded.body);
  return tempPath;
}

async function buildAuditResultFromSqsPayload(
  payload: ScannerSqsResultPayload,
  request: ScannerServiceAuditRequest,
): Promise<ScannerServiceAuditResult> {
  const isLiteVersion = Boolean(request.isLiteVersion);

  if (!payload.success) {
    return {
      success: false,
      error: payload.error || 'Scanner worker failed.',
      errorCode: payload.errorCode || 'SCANNER_WORKER_FAILED',
    };
  }

  const reportPath = await downloadScannerS3Report(payload, request);
  return {
    success: true,
    reportPath,
    isLiteVersion: payload.isLiteVersion ?? isLiteVersion,
    version: payload.version === 'Lite' ? 'Lite' : 'Full',
    url: payload.url || request.url,
    device: payload.device || request.device || 'desktop',
    strategy: payload.strategy || 'Python-Camoufox-SQS',
    attemptNumber: payload.attemptNumber || 1,
    message: payload.message || 'Audit completed by scanner SQS worker.',
  };
}

export async function dispatchScannerAuditJob(request: ScannerServiceAuditRequest): Promise<ScannerSqsDispatchResult> {
  const queueKind = resolveScannerQueueKind(request);
  const scannerTier = resolveScannerTier(request.scannerTier);
  const jobQueueUrl = resolveJobQueueUrl(queueKind, scannerTier);
  const resultQueueUrl = queueKind === 'quick' ? env.scannerSqsQuickResultQueueUrl : env.scannerSqsFullResultQueueUrl;

  if (!jobQueueUrl || !resultQueueUrl) {
    return {
      success: false,
      error: `Scanner SQS ${queueKind} mode is enabled but its job or result queue URL is missing.`,
      errorCode: 'SCANNER_SQS_NOT_CONFIGURED',
    };
  }

  if (!env.scannerSqsArtifactBucket || !env.scannerSqsArtifactRegion) {
    return {
      success: false,
      error: 'Scanner SQS mode requires SCANNER_SQS_ARTIFACT_BUCKET/AWS_S3_BUCKET and SCANNER_SQS_ARTIFACT_REGION/AWS_REGION.',
      errorCode: 'SCANNER_SQS_ARTIFACTS_NOT_CONFIGURED',
    };
  }

  const runtime = await loadSqsRuntime();
  const client = new runtime.SQSClient({ region: env.scannerSqsArtifactRegion });
  const scannerJobId = request.scannerJobId || createScannerJobId();
  const isLiteVersion = Boolean(request.isLiteVersion);
  const body = {
    schemaVersion: 1,
    scannerJobId,
    url: request.url,
    device: request.device || 'desktop',
    format: request.format || 'json',
    isLiteVersion,
    includeReport: true,
    queueKind,
    scannerTier,
    requestedAt: new Date().toISOString(),
    artifact: {
      bucket: env.scannerSqsArtifactBucket,
      region: env.scannerSqsArtifactRegion,
      prefix: env.scannerSqsArtifactPrefix,
    },
  };

  scannerClientLogger.info('Queueing scanner-service audit through SQS.', {
    scannerJobId,
    url: request.url,
    device: body.device,
    isLiteVersion,
    queueKind,
    scannerTier,
    jobQueueUrl,
    resultQueueUrl,
  });

  await client.send(new runtime.SendMessageCommand({
    QueueUrl: jobQueueUrl,
    MessageBody: JSON.stringify(body),
  }));

  return {
    success: true,
    scannerJobId,
    queueKind,
    jobQueueUrl,
    resultQueueUrl,
    scannerTier,
  };
}

export async function dispatchScannerFullAuditBatch(request: ScannerFullAuditBatchRequest): Promise<ScannerFullAuditBatchDispatchResult> {
  if (env.scannerDispatchMode !== 'sqs') {
    return {
      success: false,
      error: 'Full-audit batch scanning requires SCANNER_DISPATCH_MODE=sqs.',
      errorCode: 'SCANNER_SQS_NOT_ENABLED',
    };
  }

  const scannerTier = resolveScannerTier(request.scannerTier);
  const jobQueueUrl = resolveJobQueueUrl('full', scannerTier);
  const resultQueueUrl = env.scannerSqsFullResultQueueUrl;
  if (!jobQueueUrl || !resultQueueUrl) {
    return {
      success: false,
      error: 'Full-audit batch scanning requires full scanner SQS job and result queue URLs.',
      errorCode: 'SCANNER_SQS_NOT_CONFIGURED',
    };
  }

  if (!env.scannerSqsResultWorkerEnabled) {
    return {
      success: false,
      error: 'Full-audit batch scanning requires SCANNER_SQS_RESULT_WORKER_ENABLED=true.',
      errorCode: 'SCANNER_RESULT_WORKER_NOT_ENABLED',
    };
  }

  if (!env.scannerSqsArtifactBucket || !env.scannerSqsArtifactRegion) {
    return {
      success: false,
      error: 'Scanner SQS mode requires SCANNER_SQS_ARTIFACT_BUCKET/AWS_S3_BUCKET and SCANNER_SQS_ARTIFACT_REGION/AWS_REGION.',
      errorCode: 'SCANNER_SQS_ARTIFACTS_NOT_CONFIGURED',
    };
  }

  const runtime = await loadSqsRuntime();
  const client = new runtime.SQSClient({ region: env.scannerSqsArtifactRegion });
  const scannerJobId = request.scannerJobId || createScannerJobId();
  const targets = request.targets ?? [];
  if (targets.length === 0 && !request.orchestration) {
    return {
      success: false,
      error: 'Full-audit batch scanning requires targets or scanner orchestration metadata.',
      errorCode: 'SCANNER_BATCH_TARGETS_REQUIRED',
    };
  }

  const body = {
    schemaVersion: 1,
    jobType: 'fullAuditBatch',
    scannerJobId,
    queueKind: 'full',
    scannerTier,
    requestedAt: new Date().toISOString(),
    artifact: {
      bucket: env.scannerSqsArtifactBucket,
      region: env.scannerSqsArtifactRegion,
      prefix: env.scannerSqsArtifactPrefix,
    },
    ...(request.reportGeneration ? {
      reportGeneration: {
        enabled: Boolean(request.reportGeneration.enabled),
        email: request.reportGeneration.email,
        taskId: request.reportGeneration.taskId,
        url: request.reportGeneration.url,
        planId: request.reportGeneration.planId,
        selectedDevice: request.reportGeneration.selectedDevice,
        fullName: request.reportGeneration.fullName,
      },
    } : {}),
    ...(request.orchestration ? {
      orchestration: {
        url: request.orchestration.url,
        devices: request.orchestration.devices,
        crawlScope: request.orchestration.crawlScope,
      },
    } : {}),
    targets: targets.map((target) => ({
      url: target.url,
      device: target.device,
      preferredScanMode: target.preferredScanMode,
      isLiteVersion: target.preferredScanMode === 'lite',
      isHomepage: Boolean(target.isHomepage),
      allowFullRetry: Boolean(target.allowFullRetry),
    })),
  };

  scannerClientLogger.info('Queueing full-audit batch through scanner SQS.', {
    scannerJobId,
    targetCount: body.targets.length,
    orchestrationInScanner: Boolean(request.orchestration),
    scannerTier,
    jobQueueUrl,
    resultQueueUrl,
  });

  await client.send(new runtime.SendMessageCommand({
    QueueUrl: jobQueueUrl,
    MessageBody: JSON.stringify(body),
  }));

  return {
    success: true,
    scannerJobId,
    jobQueueUrl,
    resultQueueUrl,
    targetCount: body.targets.length,
    scannerTier,
  };
}

export async function requestScannerFullAuditBatch(request: ScannerFullAuditBatchRequest): Promise<ScannerFullAuditBatchResult> {
  const dispatchResult = await dispatchScannerFullAuditBatch(request);
  if (!dispatchResult.success) {
    return dispatchResult;
  }

  const scannerJobId = dispatchResult.scannerJobId;
  const startedAt = Date.now();
  const timeoutMs = env.queueFullAuditJobTimeoutMs;
  const timeoutMinutes = Math.floor(timeoutMs / 60_000);

  while (Date.now() - startedAt < timeoutMs) {
    const storedResult = await ScannerResult.findOne({ scannerJobId }).lean() as {
      payload?: ScannerSqsResultPayload;
    } | null;

    if (!storedResult?.payload) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      continue;
    }

    await ScannerResult.deleteOne({ scannerJobId }).catch(() => undefined);

    if (!storedResult.payload.success) {
      return {
        success: false,
        error: storedResult.payload.error || 'Scanner full-audit batch failed.',
        errorCode: storedResult.payload.errorCode || 'SCANNER_WORKER_FAILED',
      };
    }

    const aggregatePath = await downloadScannerS3Report(storedResult.payload, {
      url: request.targets?.[0]?.url || request.orchestration?.url || 'full-audit-batch',
      device: 'desktop',
      isLiteVersion: false,
      scannerQueue: 'full',
    });
    const aggregate = JSON.parse(await fs.readFile(aggregatePath, 'utf8')) as ScannerFullAuditBatchArtifact;
    await fs.unlink(aggregatePath).catch(() => undefined);

    const targets = await Promise.all((aggregate.targets || []).map(async (target, index): Promise<ScannerFullAuditBatchTargetResult> => {
      const fallbackTarget = request.targets?.[index];
      const url = target.url || fallbackTarget?.url || 'unknown';
      const device = target.device || fallbackTarget?.device || 'desktop';
      const isLiteVersion = Boolean(target.isLiteVersion);
      const scanModeUsed = target.scanModeUsed === 'lite' || isLiteVersion ? 'lite' : 'full';

      if (!target.success || !target.report) {
        return {
          success: false,
          url,
          device,
          isLiteVersion,
          scanModeUsed,
          shouldUseLiteForFuture: target.shouldUseLiteForFuture,
          fullFailureCountDelta: target.fullFailureCountDelta,
          degradedReason: target.degradedReason,
          error: target.error || 'Scanner target failed.',
          errorCode: target.errorCode,
          statusCode: target.statusCode,
          originalError: target.originalError,
        };
      }

      const hostname = resolveReportHostname(url);
      const tempPath = path.join(os.tmpdir(), `scanner-sqs-batch-${hostname}-${device}-${Date.now()}-${index}.json`);
      await fs.writeFile(tempPath, JSON.stringify(target.report, null, 2), 'utf8');

      return {
        success: true,
        url,
        device,
        reportPath: tempPath,
        isLiteVersion,
        scanModeUsed,
        shouldUseLiteForFuture: target.shouldUseLiteForFuture,
        fullFailureCountDelta: target.fullFailureCountDelta,
        degradedReason: target.degradedReason,
      };
    }));

    return {
      success: true,
      scannerJobId,
      targets,
      ...(storedResult.payload.reportStorage ? { reportStorage: storedResult.payload.reportStorage } : {}),
      ...(storedResult.payload.reportsGeneratedInWorker ? { reportsGeneratedInWorker: true } : {}),
      ...(storedResult.payload.aiReport ? { aiReport: storedResult.payload.aiReport } : {}),
    };
  }

  return {
    success: false,
    error: `The scanner full-audit batch timed out after ${timeoutMinutes} minutes.`,
    errorCode: 'REQUEST_TIMEOUT',
  };
}

async function requestScannerAuditViaSqs(request: ScannerServiceAuditRequest): Promise<ScannerServiceAuditResult> {
  const dispatchResult = await dispatchScannerAuditJob(request);
  if (!dispatchResult.success) {
    return dispatchResult;
  }

  const resultQueueUrl = dispatchResult.resultQueueUrl;
  const scannerJobId = dispatchResult.scannerJobId;
  const isLiteVersion = Boolean(request.isLiteVersion);
  const timeoutMs = buildTimeoutMs(isLiteVersion);
  const timeoutMinutes = Math.floor(timeoutMs / 60_000);
  const startedAt = Date.now();

  if (dispatchResult.queueKind === 'full' && env.scannerSqsResultWorkerEnabled) {
    while (Date.now() - startedAt < timeoutMs) {
      const storedResult = await ScannerResult.findOne({ scannerJobId }).lean() as {
        payload?: ScannerSqsResultPayload;
      } | null;

      if (storedResult?.payload) {
        await ScannerResult.deleteOne({ scannerJobId }).catch(() => undefined);
        return buildAuditResultFromSqsPayload(storedResult.payload, request);
      }

      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }

    return {
      success: false,
      error: `The scanner SQS job timed out after ${timeoutMinutes} minutes.`,
      errorCode: 'REQUEST_TIMEOUT',
    };
  }

  const runtime = await loadSqsRuntime();
  const client = new runtime.SQSClient({ region: env.scannerSqsArtifactRegion });

  while (Date.now() - startedAt < timeoutMs) {
    const response = await client.send(new runtime.ReceiveMessageCommand({
      QueueUrl: resultQueueUrl,
      MaxNumberOfMessages: 5,
      WaitTimeSeconds: env.scannerSqsWaitTimeSeconds,
      VisibilityTimeout: env.scannerSqsResultVisibilityTimeoutSeconds,
    }));

    for (const message of response.Messages || []) {
      const resultPayload = parseSqsResultBody(message.Body);
      if (resultPayload?.scannerJobId !== scannerJobId) {
        if (message.ReceiptHandle) {
          await client.send(new runtime.ChangeMessageVisibilityCommand({
            QueueUrl: resultQueueUrl,
            ReceiptHandle: message.ReceiptHandle,
            VisibilityTimeout: 0,
          })).catch(() => undefined);
        }
        continue;
      }

      if (message.ReceiptHandle) {
        await client.send(new runtime.DeleteMessageCommand({
          QueueUrl: resultQueueUrl,
          ReceiptHandle: message.ReceiptHandle,
        }));
      }

      return buildAuditResultFromSqsPayload(resultPayload, request);
    }
  }

  return {
    success: false,
    error: `The scanner SQS job timed out after ${timeoutMinutes} minutes.`,
    errorCode: 'REQUEST_TIMEOUT',
  };
}

export async function requestScannerAudit(
  request: ScannerServiceAuditRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<ScannerServiceAuditResult> {
  if (env.scannerDispatchMode === 'sqs') {
    return requestScannerAuditViaSqs(request);
  }

  const isLiteVersion = Boolean(request.isLiteVersion);
  const timeoutMs = buildTimeoutMs(isLiteVersion);
  const timeoutMinutes = Math.floor(timeoutMs / 60_000);
  const body = {
    url: request.url,
    device: request.device || 'desktop',
    format: request.format || 'json',
    isLiteVersion,
    includeReport: Boolean(request.includeReport),
  };

  scannerClientLogger.info('Requesting scanner-service audit.', {
    url: request.url,
    device: body.device,
    isLiteVersion,
    includeReport: body.includeReport,
    scannerServiceUrl: env.scannerServiceUrl,
  });

  try {
    const response = await fetchImpl(`${env.scannerServiceUrl}/audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const payload = await response.json().catch(() => undefined) as ScannerServiceAuditPayload | undefined;

    if (!response.ok || !payload?.success) {
      return mapScannerFailure(response.status, payload, timeoutMinutes);
    }

    const reportPath = await resolveLocalReportPath(payload, request);

    return {
      success: true,
      reportPath,
      ...(payload.report ? { report: payload.report } : {}),
      isLiteVersion: payload.isLiteVersion ?? isLiteVersion,
      version: payload.version === 'Full' ? 'Full' : 'Lite',
      url: payload.url || request.url,
      device: payload.device || body.device,
      strategy: payload.strategy || 'Python-Camoufox',
      attemptNumber: payload.attemptNumber || 1,
      message: payload.message || 'Audit completed using scanner service.',
    };
  } catch (error) {
    const errorCode = extractNestedErrorCode(error);
    const message = error instanceof Error ? error.message : String(error);

    if (errorCode === 'ECONNREFUSED') {
      return {
        success: false,
        error: 'Unable to connect to the scanner service. The service may be down or unreachable.',
        errorCode: 'SERVICE_UNAVAILABLE',
      };
    }

    if ((error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) || /timeout/i.test(message)) {
      return {
        success: false,
        error: `The scan request timed out after ${timeoutMinutes} minutes. The website may be taking too long to load. Please try again or contact support if the issue persists.`,
        errorCode: 'REQUEST_TIMEOUT',
      };
    }

    scannerClientLogger.error('Scanner-service request failed.', {
      url: request.url,
      error: message,
      code: errorCode,
    });

    return {
      success: false,
      error: `An error occurred while scanning the website: ${message}. Please try again or contact support if the issue persists.`,
      errorCode: 'SCANNER_SERVICE_ERROR',
      originalError: message,
    };
  }
}

export async function requestScannerLoadSnapshot(
  fetchImpl: typeof fetch = fetch,
): Promise<ScannerServiceLoadSnapshot | null> {
  try {
    const response = await fetchImpl(`${env.scannerServiceUrl}/load`, {
      method: 'GET',
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json().catch(() => undefined) as ScannerServiceLoadSnapshot | undefined;
    return payload || null;
  } catch {
    return null;
  }
}
