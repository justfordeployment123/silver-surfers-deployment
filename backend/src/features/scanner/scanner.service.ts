import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, HTTPRequest, Page } from 'puppeteer';

import { env } from '../../config/env.ts';
import { logger } from '../../config/logger.ts';
import { AppError } from '../../shared/errors/app-error.ts';
import { summarizeScannerChildLogs } from './scanner-log-summary.ts';

const scannerLogger = logger.child('feature:scanner');

puppeteerExtra.use(StealthPlugin());

export interface ScannerAuditRequest {
  url: string;
  device?: 'desktop' | 'mobile' | 'tablet';
  format?: 'json' | 'html';
  isLiteVersion?: boolean;
  includeReport?: boolean;
}

export interface ScannerAuditResponse {
  success: true;
  reportPath: string;
  report?: Record<string, unknown>;
  isLiteVersion: boolean;
  version: 'Lite' | 'Full';
  url: string;
  device: 'desktop' | 'mobile' | 'tablet';
  strategy: 'Node-Lighthouse';
  attemptNumber: 1;
  message: string;
}

interface ScannerAuditSlot {
  release: () => void;
  activeAudits: number;
  queuedAudits: number;
}

interface BrowserPoolEntry {
  browser: Browser;
  id: string;
  inUse: boolean;
  wsEndpoint: string;
}

interface BrowserPoolWaiter {
  resolve: (entry: BrowserPoolEntry) => void;
  reject: (error: Error) => void;
}

interface ScannerBrowserLease {
  browser: Browser;
  browserId: string;
  release: () => void;
  wsEndpoint: string;
}

const MAX_CHILD_LOG_CHARS = 64 * 1024;
const PRECHECK_BLOCKED_RESOURCE_TYPES = new Set(['font', 'image', 'media', 'other']);
let activeAudits = 0;
const auditWaitQueue: Array<() => void> = [];
const browserPool: BrowserPoolEntry[] = [];
const browserWaitQueue: BrowserPoolWaiter[] = [];
let browserSequence = 0;
let launchingBrowsers = 0;

export interface ScannerPrecheckResponse {
  success: boolean;
  finalUrl?: string;
  status?: number;
  redirected?: boolean;
  error?: string;
}

function normalizeUrl(input: string): string {
  const trimmed = String(input || '').trim();
  if (!trimmed) {
    throw new AppError('URL is required', 400);
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function getReportPath(url: string, isLiteVersion: boolean): string {
  const hostname = new URL(url).hostname.replace(/\./g, '-');
  const suffix = isLiteVersion ? '-lite' : '';
  return path.join(os.tmpdir(), `report-${hostname}-${Date.now()}${suffix}.json`);
}

function getScannerBrowserPoolSize(): number {
  return Math.max(1, env.scannerMaxConcurrentAudits);
}

function buildScannerBrowserArgs(): string[] {
  return [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-background-networking',
    '--disable-component-extensions-with-background-pages',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--mute-audio',
    '--no-first-run',
  ];
}

function removeBrowserEntry(entryId: string): void {
  const index = browserPool.findIndex((entry) => entry.id === entryId);
  if (index >= 0) {
    browserPool.splice(index, 1);
  }
}

export function shouldBlockPrecheckResource(resourceType: string): boolean {
  return PRECHECK_BLOCKED_RESOURCE_TYPES.has(resourceType);
}

function releaseBrowserEntry(entry: BrowserPoolEntry): void {
  if (!entry.browser.isConnected()) {
    removeBrowserEntry(entry.id);
    void refillBrowserWaitQueue();
    return;
  }

  const nextWaiter = browserWaitQueue.shift();
  if (nextWaiter) {
    entry.inUse = true;
    nextWaiter.resolve(entry);
    return;
  }

  entry.inUse = false;
}

function createBrowserLease(entry: BrowserPoolEntry): ScannerBrowserLease {
  return {
    browser: entry.browser,
    browserId: entry.id,
    release: () => releaseBrowserEntry(entry),
    wsEndpoint: entry.wsEndpoint,
  };
}

async function launchBrowserEntry(): Promise<BrowserPoolEntry> {
  const browser = await puppeteerExtra.launch({
    headless: true,
    executablePath: env.chromePath,
    args: buildScannerBrowserArgs(),
  });

  const entry: BrowserPoolEntry = {
    browser,
    id: `scanner-browser-${++browserSequence}`,
    inUse: false,
    wsEndpoint: browser.wsEndpoint(),
  };

  browser.on('disconnected', () => {
    removeBrowserEntry(entry.id);
    void refillBrowserWaitQueue();
  });

  scannerLogger.info('Launched pooled scanner browser.', {
    browserId: entry.id,
    maxPoolSize: getScannerBrowserPoolSize(),
  });

  return entry;
}

async function refillBrowserWaitQueue(): Promise<void> {
  if (browserWaitQueue.length === 0) {
    return;
  }

  const availableEntry = browserPool.find((entry) => entry.browser.isConnected() && !entry.inUse);
  if (availableEntry) {
    const waiter = browserWaitQueue.shift();
    if (waiter) {
      availableEntry.inUse = true;
      waiter.resolve(availableEntry);
    }
    return;
  }

  if ((browserPool.length + launchingBrowsers) >= getScannerBrowserPoolSize()) {
    return;
  }

  launchingBrowsers += 1;
  try {
    const entry = await launchBrowserEntry();
    browserPool.push(entry);

    const waiter = browserWaitQueue.shift();
    if (waiter) {
      entry.inUse = true;
      waiter.resolve(entry);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const browserError = new AppError(`Failed to launch pooled scanner browser: ${message}`, 500);
    while (browserWaitQueue.length > 0) {
      browserWaitQueue.shift()?.reject(browserError);
    }
  } finally {
    launchingBrowsers = Math.max(launchingBrowsers - 1, 0);
  }
}

async function acquireBrowserLease(): Promise<ScannerBrowserLease> {
  const availableEntry = browserPool.find((entry) => entry.browser.isConnected() && !entry.inUse);
  if (availableEntry) {
    availableEntry.inUse = true;
    return createBrowserLease(availableEntry);
  }

  if ((browserPool.length + launchingBrowsers) < getScannerBrowserPoolSize()) {
    launchingBrowsers += 1;
    try {
      const entry = await launchBrowserEntry();
      entry.inUse = true;
      browserPool.push(entry);
      return createBrowserLease(entry);
    } finally {
      launchingBrowsers = Math.max(launchingBrowsers - 1, 0);
    }
  }

  return new Promise<ScannerBrowserLease>((resolve, reject) => {
    browserWaitQueue.push({
      resolve: (entry) => resolve(createBrowserLease(entry)),
      reject,
    });
  });
}

function appendLimitedLog(current: string, chunk: string): string {
  const next = current + chunk;
  if (next.length <= MAX_CHILD_LOG_CHARS) {
    return next;
  }

  return next.slice(-MAX_CHILD_LOG_CHARS);
}

async function acquireAuditSlot(): Promise<ScannerAuditSlot> {
  if (activeAudits < env.scannerMaxConcurrentAudits) {
    activeAudits += 1;
    return {
      release: releaseAuditSlot,
      activeAudits,
      queuedAudits: auditWaitQueue.length,
    };
  }

  if (auditWaitQueue.length >= env.scannerMaxQueuedAudits) {
    throw new AppError('Scanner is at capacity. Please try again in a few moments.', 503);
  }

  await new Promise<void>((resolve) => {
    auditWaitQueue.push(resolve);
  });

  activeAudits += 1;
  return {
    release: releaseAuditSlot,
    activeAudits,
    queuedAudits: auditWaitQueue.length,
  };
}

function releaseAuditSlot(): void {
  activeAudits = Math.max(activeAudits - 1, 0);
  const next = auditWaitQueue.shift();
  if (next) {
    next();
  }
}

export function getScannerLoad(): {
  activeAudits: number;
  queuedAudits: number;
  maxConcurrentAudits: number;
  maxQueuedAudits: number;
  browserPoolSize: number;
  browsersInUse: number;
  browserWaiters: number;
} {
  return {
    activeAudits,
    queuedAudits: auditWaitQueue.length,
    maxConcurrentAudits: env.scannerMaxConcurrentAudits,
    maxQueuedAudits: env.scannerMaxQueuedAudits,
    browserPoolSize: browserPool.length,
    browsersInUse: browserPool.filter((entry) => entry.inUse).length,
    browserWaiters: browserWaitQueue.length,
  };
}

function spawnProcess(command: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new AppError(`Scanner timed out after ${Math.round(timeoutMs / 1000)} seconds.`, 504));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout = appendLimitedLog(stdout, chunk.toString());
    });

    child.stderr.on('data', (chunk) => {
      stderr = appendLimitedLog(stderr, chunk.toString());
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(new AppError(`Failed to start scanner process: ${error.message}`, 500));
    });

    child.on('exit', (code) => {
      clearTimeout(timeout);

      if (code === 0) {
        const summary = summarizeScannerChildLogs(stdout, stderr);

        if (summary.stdoutHighlights.length > 0) {
          scannerLogger.debug('Scanner runner highlights.', {
            lineCount: summary.stdoutLineCount,
            highlights: summary.stdoutHighlights,
          });
        }

        if (summary.statusCount > 0) {
          scannerLogger.debug('Lighthouse progress stream captured.', {
            statusCount: summary.statusCount,
            lastStatus: summary.lastStatus,
          });
        }

        if (summary.warningLines.length > 0) {
          scannerLogger.warn('Scanner runner emitted non-progress stderr output.', {
            stderr: summary.warningLines.join('\n'),
          });
        }

        resolve();
        return;
      }

      reject(new AppError('Scanner runner failed.', 500, {
        details: {
          code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        },
      }));
    });
  });
}

async function configurePrecheckPage(page: Page): Promise<void> {
  await page.setRequestInterception(true);

  page.on('request', (request: HTTPRequest) => {
    if (shouldBlockPrecheckResource(request.resourceType())) {
      request.abort().catch(() => undefined);
      return;
    }

    request.continue().catch(() => undefined);
  });
}

async function browserPrecheck(url: string): Promise<ScannerPrecheckResponse> {
  const browserLease = await acquireBrowserLease();
  let page: Page | undefined;

  try {
    page = await browserLease.browser.newPage();
    await configurePrecheckPage(page);
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    return {
      success: true,
      finalUrl: page.url(),
      status: response?.status() || 200,
      redirected: page.url() !== url,
    };
  } finally {
    await page?.close().catch(() => undefined);
    browserLease.release();
  }
}

export async function runPrecheck(input: string): Promise<ScannerPrecheckResponse> {
  const url = normalizeUrl(input);

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok && response.status !== 405) {
      return {
        success: true,
        finalUrl: response.url || url,
        status: response.status,
        redirected: response.redirected,
      };
    }
  } catch (error) {
    scannerLogger.warn('Fetch-based precheck failed; falling back to browser precheck.', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    return await browserPrecheck(url);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Precheck failed',
    };
  }
}

export async function runScannerAudit(request: ScannerAuditRequest): Promise<ScannerAuditResponse> {
  throw new AppError(
    'The legacy in-process scanner has been removed. Use the Python Camoufox + axe-core scanner service via SCANNER_SERVICE_URL.',
    410,
    'LEGACY_SCANNER_REMOVED',
  );
}
