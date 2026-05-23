import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { logger } from '../../config/logger.ts';
import { resolveBackendPath } from '../../config/paths.ts';

export interface CacheCleanupSummary {
  removedFiles: number;
  removedDirectories: number;
  removedPaths: string[];
}

interface CacheManagerOptions {
  cleanupIntervalMs: number;
  tempReportTtlMs: number;
  reportDirectoryTtlMs: number;
  quickScanReportTtlMs: number;
}

const cacheLogger = logger.child('cache');
const managedTempReportPattern = /^report-[a-z0-9.-]+-\d+(?:-lite)?\.(?:json|html)$/i;
export const ACTIVE_REPORT_MARKER_FILE = '.active-audit';

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export function isExpiredTimestamp(timestampMs: number, ttlMs: number, now = Date.now()): boolean {
  return now - timestampMs >= ttlMs;
}

export function isManagedTempReportFile(fileName: string): boolean {
  return managedTempReportPattern.test(fileName);
}

async function collectExpiredTempReports(rootPath: string, ttlMs: number, now: number): Promise<string[]> {
  if (!(await pathExists(rootPath))) {
    return [];
  }

  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const expiredPaths: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !isManagedTempReportFile(entry.name)) {
      continue;
    }

    const targetPath = path.join(rootPath, entry.name);
    const stats = await fs.stat(targetPath);

    if (isExpiredTimestamp(stats.mtimeMs, ttlMs, now)) {
      expiredPaths.push(targetPath);
    }
  }

  return expiredPaths;
}

async function collectExpiredDirectories(
  rootPath: string,
  ttlMs: number,
  now: number,
  maxDepth: number,
  depth = 0,
): Promise<string[]> {
  if (!(await pathExists(rootPath))) {
    return [];
  }

  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const expiredPaths: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const targetPath = path.join(rootPath, entry.name);
    if (await pathExists(path.join(targetPath, ACTIVE_REPORT_MARKER_FILE))) {
      continue;
    }

    const stats = await fs.stat(targetPath);
    const childEntries = await fs.readdir(targetPath, { withFileTypes: true });
    const childDirectories = childEntries.filter((childEntry) => childEntry.isDirectory());

    if (depth + 1 < maxDepth) {
      expiredPaths.push(...await collectExpiredDirectories(targetPath, ttlMs, now, maxDepth, depth + 1));
    }

    if (isExpiredTimestamp(stats.mtimeMs, ttlMs, now) && (depth + 1 === maxDepth || childDirectories.length === 0)) {
      expiredPaths.push(targetPath);
    }
  }

  return expiredPaths;
}

async function removePaths(pathsToRemove: string[]): Promise<CacheCleanupSummary> {
  const uniquePaths = Array.from(new Set(pathsToRemove)).sort((left, right) => right.length - left.length);
  let removedFiles = 0;
  let removedDirectories = 0;
  const removedPaths: string[] = [];

  for (const targetPath of uniquePaths) {
    try {
      const stats = await fs.stat(targetPath);
      await fs.rm(targetPath, { recursive: true, force: true });
      removedPaths.push(targetPath);

      if (stats.isDirectory()) {
        removedDirectories += 1;
      } else {
        removedFiles += 1;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        cacheLogger.warn('Failed to remove cache path.', {
          path: targetPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return { removedFiles, removedDirectories, removedPaths };
}

async function removeEmptyDirectories(rootPath: string, maxDepth: number, depth = 0): Promise<string[]> {
  if (depth >= maxDepth || !(await pathExists(rootPath))) {
    return [];
  }

  const removed: string[] = [];
  const entries = await fs.readdir(rootPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const targetPath = path.join(rootPath, entry.name);
    removed.push(...await removeEmptyDirectories(targetPath, maxDepth, depth + 1));

    try {
      if (await pathExists(path.join(targetPath, ACTIVE_REPORT_MARKER_FILE))) {
        continue;
      }

      const remainingEntries = await fs.readdir(targetPath);
      if (remainingEntries.length === 0) {
        await fs.rmdir(targetPath);
        removed.push(targetPath);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        cacheLogger.warn('Failed to prune empty cache directory.', {
          path: targetPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return removed;
}

export async function cleanupManagedCache(options: {
  tempRootPath?: string;
  reportRootPaths?: string[];
  tempReportTtlMs: number;
  reportDirectoryTtlMs: number;
  quickScanReportTtlMs?: number;
  now?: number;
}): Promise<CacheCleanupSummary> {
  const now = options.now ?? Date.now();
  const tempRootPath = options.tempRootPath ?? os.tmpdir();
  const reportRootPaths = options.reportRootPaths ?? [
    resolveBackendPath('reports'),
    resolveBackendPath('reports-full'),
    resolveBackendPath('reports-lite'),
  ];
  const rootTtls = reportRootPaths.map((rootPath) => ({
    rootPath,
    ttlMs: path.basename(rootPath) === 'reports-lite'
      ? (options.quickScanReportTtlMs ?? options.reportDirectoryTtlMs)
      : options.reportDirectoryTtlMs,
  }));

  const staleTempFiles = await collectExpiredTempReports(tempRootPath, options.tempReportTtlMs, now);
  const staleReportDirectories = (
    await Promise.all(rootTtls.map(({ rootPath, ttlMs }) => collectExpiredDirectories(rootPath, ttlMs, now, 2)))
  ).flat();

  const removalSummary = await removePaths([
    ...staleTempFiles,
    ...staleReportDirectories,
  ]);

  const prunedEmptyDirectories = (
    await Promise.all(reportRootPaths.map((rootPath) => removeEmptyDirectories(rootPath, 2)))
  ).flat();

  return {
    removedFiles: removalSummary.removedFiles,
    removedDirectories: removalSummary.removedDirectories + prunedEmptyDirectories.length,
    removedPaths: [...removalSummary.removedPaths, ...prunedEmptyDirectories],
  };
}

export class CacheManager {
  readonly #options: CacheManagerOptions;
  readonly #logger = cacheLogger;
  #timer: NodeJS.Timeout | undefined;

  constructor(options: CacheManagerOptions) {
    this.#options = options;
  }

  start(): void {
    if (this.#timer) {
      return;
    }

    this.#timer = setInterval(() => {
      void this.performCleanup();
    }, this.#options.cleanupIntervalMs);
    this.#timer.unref();

    this.#logger.info('Cache manager started.', {
      cleanupIntervalMs: this.#options.cleanupIntervalMs,
      tempReportTtlMs: this.#options.tempReportTtlMs,
      reportDirectoryTtlMs: this.#options.reportDirectoryTtlMs,
      quickScanReportTtlMs: this.#options.quickScanReportTtlMs,
    });
  }

  stop(): void {
    if (!this.#timer) {
      return;
    }

    clearInterval(this.#timer);
    this.#timer = undefined;
  }

  async performCleanup(): Promise<CacheCleanupSummary> {
    const summary = await cleanupManagedCache({
      tempReportTtlMs: this.#options.tempReportTtlMs,
      reportDirectoryTtlMs: this.#options.reportDirectoryTtlMs,
      quickScanReportTtlMs: this.#options.quickScanReportTtlMs,
    });

    if (summary.removedFiles > 0 || summary.removedDirectories > 0) {
      this.#logger.info('Removed stale cache entries.', {
        removedFiles: summary.removedFiles,
        removedDirectories: summary.removedDirectories,
        removedPaths: summary.removedPaths,
      });
    }

    return summary;
  }
}
