import type { Server } from 'node:http';

import { connectDatabase, disconnectDatabase } from '../config/database.ts';
import { env } from '../config/env.ts';
import { logger } from '../config/logger.ts';
import { recoverAuditRecords } from '../features/audits/audit-recovery.ts';
import { closeAuditCache } from '../features/audits/audit-cache.ts';
import { runFullAuditProcess, runQuickScanProcess } from '../features/audits/audit-processors.ts';
import { setAuditQueues } from '../features/audits/audits.runtime.ts';
import { CacheManager } from '../infrastructure/cache/cache-manager.ts';
import { createJobQueue } from '../infrastructure/queues/queue-factory.ts';
import type { JobQueue } from '../infrastructure/queues/job-queue.ts';
import AnalysisRecord from '../models/analysis-record.model.ts';

const runtimeLogger = logger.child('runtime');

type RuntimeMode = 'api' | 'worker';

let watchdogTimer: NodeJS.Timeout | undefined;
let auditRecoveryTimer: NodeJS.Timeout | undefined;

export interface RuntimeDependencies {
  mode: RuntimeMode;
  fullAuditQueue: JobQueue;
  quickScanQueue: JobQueue;
  cacheManager?: CacheManager;
}

function createAuditQueues(): { fullAuditQueue: JobQueue; quickScanQueue: JobQueue } {
  const factoryOptions = {
    backend: env.queueBackend,
    redisUrl: env.redisUrl,
    bullMqPrefix: env.bullMqPrefix,
  };

  const fullAuditQueue = createJobQueue('FullAudit', runFullAuditProcess, {
    concurrency: env.queueFullAuditConcurrency,
    maxRetries: env.queueMaxRetries,
    retryDelay: 10000,
    cleanupInterval: env.queueCleanupIntervalMs,
    maintenanceIntervalMs: env.queueMaintenanceIntervalMs,
    leaseDurationMs: env.queueLeaseDurationMs,
    heartbeatIntervalMs: env.queueHeartbeatIntervalMs,
  }, factoryOptions);

  const quickScanQueue = createJobQueue('QuickScan', runQuickScanProcess, {
    concurrency: env.queueQuickScanConcurrency,
    maxRetries: env.queueMaxRetries,
    retryDelay: 5000,
    cleanupInterval: env.queueCleanupIntervalMs,
    maintenanceIntervalMs: env.queueMaintenanceIntervalMs,
    leaseDurationMs: env.queueLeaseDurationMs,
    heartbeatIntervalMs: env.queueHeartbeatIntervalMs,
  }, factoryOptions);

  return { fullAuditQueue, quickScanQueue };
}

function createCacheManager(): CacheManager {
  return new CacheManager({
    cleanupIntervalMs: env.cacheCleanupIntervalMs,
    tempReportTtlMs: env.tempReportTtlMs,
    reportDirectoryTtlMs: env.reportDirectoryTtlMs,
    quickScanReportTtlMs: env.quickScanReportTtlMs,
  });
}

export async function initializeApiRuntime(): Promise<RuntimeDependencies> {
  await connectDatabase(env.mongoUri);

  const { fullAuditQueue, quickScanQueue } = createAuditQueues();
  await injectQueues(fullAuditQueue, quickScanQueue);

  runtimeLogger.info('Initialized API runtime in enqueue-only mode.', {
    backendRoot: env.backendRoot,
    queueBackend: env.queueBackend,
    bullMqPrefix: env.bullMqPrefix,
    workerRequired: true,
    scannerServiceUrl: env.scannerServiceUrl,
    note: 'Run the worker and scanner services separately or queued audits will not be processed.',
  });

  return {
    mode: 'api',
    fullAuditQueue,
    quickScanQueue,
  };
}

export async function initializeWorkerRuntime(): Promise<RuntimeDependencies> {
  await connectDatabase(env.mongoUri);

  const { fullAuditQueue, quickScanQueue } = createAuditQueues();
  await Promise.all([fullAuditQueue.recoverJobs(), quickScanQueue.recoverJobs()]);
  await Promise.all([fullAuditQueue.start(), quickScanQueue.start()]);

  const cacheManager = createCacheManager();
  cacheManager.start();
  startWatchdog();
  if (env.auditRecoveryEnabled) {
    startAuditRecoveryChecker(fullAuditQueue, quickScanQueue);
  } else {
    runtimeLogger.info('Audit recovery checker is disabled.', {
      auditRecoveryEnabled: env.auditRecoveryEnabled,
    });
  }

  runtimeLogger.info('Initialized worker runtime.', {
    backendRoot: env.backendRoot,
    queueBackend: env.queueBackend,
    bullMqPrefix: env.bullMqPrefix,
    scannerServiceUrl: env.scannerServiceUrl,
  });

  return {
    mode: 'worker',
    fullAuditQueue,
    quickScanQueue,
    cacheManager,
  };
}

export const initializeRuntime = initializeApiRuntime;

async function injectQueues(fullAuditQueue: JobQueue, quickScanQueue: JobQueue): Promise<void> {
  setAuditQueues(fullAuditQueue, quickScanQueue);
}

function startWatchdog(): void {
  if (watchdogTimer) {
    return;
  }

  watchdogTimer = setInterval(async () => {
    try {
      const now = Date.now();
      const procCutoff = new Date(now - env.processingTimeoutMs);
      const queuedCutoff = new Date(now - env.queuedTimeoutMs);

      const [processingResult, queuedResult] = await Promise.all([
        AnalysisRecord.updateMany(
          { status: 'processing', updatedAt: { $lt: procCutoff } },
          { $set: { status: 'failed', failureReason: 'Processing watchdog timeout exceeded.' } },
        ),
        AnalysisRecord.updateMany(
          { status: 'queued', updatedAt: { $lt: queuedCutoff } },
          { $set: { status: 'failed', failureReason: 'Queued watchdog timeout exceeded.' } },
        ),
      ]);

      const modifiedCount = (processingResult.modifiedCount ?? 0) + (queuedResult.modifiedCount ?? 0);
      if (modifiedCount > 0) {
        runtimeLogger.warn('Watchdog marked stale analysis records as failed.', {
          processingUpdated: processingResult.modifiedCount ?? 0,
          queuedUpdated: queuedResult.modifiedCount ?? 0,
        });
      }
    } catch (error) {
      runtimeLogger.error('Watchdog failed.', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, env.watchdogIntervalMs);

  watchdogTimer.unref();
}

function startAuditRecoveryChecker(fullAuditQueue: JobQueue, quickScanQueue: JobQueue): void {
  if (auditRecoveryTimer) {
    return;
  }

  const runRecoveryPass = async () => {
    try {
      const summary = await recoverAuditRecords({
        fullAuditQueue,
        quickScanQueue,
      });

      if (
        summary.fullAuditsRecovered > 0
        || summary.quickScansRecovered > 0
        || summary.errors > 0
      ) {
        runtimeLogger.warn('Audit recovery checker completed a pass.', summary);
      }
    } catch (error) {
      runtimeLogger.error('Audit recovery checker failed.', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  void runRecoveryPass();
  auditRecoveryTimer = setInterval(() => {
    void runRecoveryPass();
  }, env.auditRecoveryCheckIntervalMs);
  auditRecoveryTimer.unref();
}

export async function shutdownRuntime(dependencies: RuntimeDependencies): Promise<void> {
  if (dependencies.mode === 'worker' && watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = undefined;
  }

  if (dependencies.mode === 'worker' && auditRecoveryTimer) {
    clearInterval(auditRecoveryTimer);
    auditRecoveryTimer = undefined;
  }

  dependencies.cacheManager?.stop();
  await closeAuditCache().catch(() => undefined);

  await Promise.all([
    dependencies.fullAuditQueue.stop(),
    dependencies.quickScanQueue.stop(),
  ]);

  await disconnectDatabase();
}

export function registerServerShutdownHooks(server: Server, dependencies: RuntimeDependencies): void {
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    runtimeLogger.warn('Received shutdown signal.', {
      signal,
      mode: dependencies.mode,
    });

    server.close(async () => {
      await shutdownRuntime(dependencies);
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

export function registerWorkerShutdownHooks(dependencies: RuntimeDependencies): void {
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    runtimeLogger.warn('Received shutdown signal.', {
      signal,
      mode: dependencies.mode,
    });

    await shutdownRuntime(dependencies);
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

export const registerShutdownHooks = registerServerShutdownHooks;
