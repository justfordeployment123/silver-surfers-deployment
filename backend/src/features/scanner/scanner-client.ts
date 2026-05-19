import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { env } from '../../config/env.ts';
import { logger } from '../../config/logger.ts';

const scannerClientLogger = logger.child('feature:scanner:client');

export interface ScannerServiceAuditRequest {
  url: string;
  device?: 'desktop' | 'mobile' | 'tablet';
  format?: 'json' | 'html';
  isLiteVersion?: boolean;
  includeReport?: boolean;
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

export async function requestScannerAudit(
  request: ScannerServiceAuditRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<ScannerServiceAuditResult> {
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
