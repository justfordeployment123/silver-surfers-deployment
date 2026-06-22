import { env } from '../../config/env.ts';
import { logger } from '../../config/logger.ts';
import {
  buildQuickScanJobFromRecord,
  completeQuickScanFromAuditResult,
} from '../audits/quick-scan.processor.ts';
import { getQuickScanModel } from '../audits/audits.dependencies.ts';
import {
  createScannerJobId,
  dispatchScannerAuditJob,
  downloadScannerS3Report,
  isScannerFailureEligibleForVpsFallback,
  loadSqsRuntime,
  parseSqsResultBody,
  type ScannerSqsResultPayload,
} from './scanner-client.ts';

const resultWorkerLogger = logger.child('feature:scanner:quick-result-worker');

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function buildAuditFailureMessage(payload: ScannerSqsResultPayload): string {
  return payload.error || 'Scanner worker failed before producing a quick scan report.';
}

export class QuickScanResultWorker {
  private running = false;
  private loopPromise: Promise<void> | undefined;

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.loopPromise = this.runLoop();
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.loopPromise?.catch(() => undefined);
  }

  private async runLoop(): Promise<void> {
    if (!env.scannerSqsQuickResultQueueUrl || !env.scannerSqsArtifactRegion) {
      resultWorkerLogger.warn('Quick scanner result worker not started; SQS result queue or AWS region is missing.', {
        scannerSqsQuickResultQueueUrl: env.scannerSqsQuickResultQueueUrl,
        scannerSqsArtifactRegion: env.scannerSqsArtifactRegion,
      });
      return;
    }

    const runtime = await loadSqsRuntime();
    const client = new runtime.SQSClient({ region: env.scannerSqsArtifactRegion });

    resultWorkerLogger.info('Quick scanner result worker started.', {
      resultQueueUrl: env.scannerSqsQuickResultQueueUrl,
      maxMessages: env.scannerSqsResultWorkerMaxMessages,
      visibilityTimeoutSeconds: env.scannerSqsResultWorkerVisibilityTimeoutSeconds,
    });

    while (this.running) {
      try {
        const response = await client.send(new runtime.ReceiveMessageCommand({
          QueueUrl: env.scannerSqsQuickResultQueueUrl,
          MaxNumberOfMessages: env.scannerSqsResultWorkerMaxMessages,
          WaitTimeSeconds: env.scannerSqsWaitTimeSeconds,
          VisibilityTimeout: env.scannerSqsResultWorkerVisibilityTimeoutSeconds,
        }));

        const messages = response.Messages || [];
        if (messages.length === 0) {
          continue;
        }

        for (const message of messages) {
          if (!this.running) {
            break;
          }

          await this.handleMessage(runtime, client, message);
        }
      } catch (error) {
        resultWorkerLogger.error('Quick scanner result worker poll failed.', {
          error: error instanceof Error ? error.message : String(error),
        });
        await sleep(5_000);
      }
    }

    resultWorkerLogger.info('Quick scanner result worker stopped.');
  }

  private async deleteMessage(
    runtime: Awaited<ReturnType<typeof loadSqsRuntime>>,
    client: InstanceType<Awaited<ReturnType<typeof loadSqsRuntime>>['SQSClient']>,
    receiptHandle: string | undefined,
  ): Promise<void> {
    if (!receiptHandle || !env.scannerSqsQuickResultQueueUrl) {
      return;
    }

    await client.send(new runtime.DeleteMessageCommand({
      QueueUrl: env.scannerSqsQuickResultQueueUrl,
      ReceiptHandle: receiptHandle,
    }));
  }

  private async handleMessage(
    runtime: Awaited<ReturnType<typeof loadSqsRuntime>>,
    client: InstanceType<Awaited<ReturnType<typeof loadSqsRuntime>>['SQSClient']>,
    message: { Body?: string; ReceiptHandle?: string; MessageId?: string },
  ): Promise<void> {
    const payload = parseSqsResultBody(message.Body);

    if (!payload?.scannerJobId) {
      resultWorkerLogger.warn('Discarding quick scanner result without scannerJobId.', {
        messageId: message.MessageId,
      });
      await this.deleteMessage(runtime, client, message.ReceiptHandle);
      return;
    }

    const QuickScan = await getQuickScanModel();
    const resultLookupConditions: Array<Record<string, unknown>> = [
      { scannerJobId: payload.scannerJobId },
      { primaryScannerJobId: payload.scannerJobId },
      { fallbackScannerJobId: payload.scannerJobId },
    ];

    if (payload.success) {
      resultLookupConditions.push({ 'scannerAttemptHistory.scannerJobId': payload.scannerJobId });
    }

    const record = await QuickScan.findOne({ $or: resultLookupConditions });

    if (!record) {
      resultWorkerLogger.warn('Discarding quick scanner result with no matching quick scan record.', {
        scannerJobId: payload.scannerJobId,
        url: payload.url,
        messageId: message.MessageId,
      });
      await this.deleteMessage(runtime, client, message.ReceiptHandle);
      return;
    }

    const quickScanId = record._id == null ? undefined : String(record._id);

    if (record.status === 'completed' && record.reportGenerated) {
      resultWorkerLogger.info('Discarding duplicate quick scanner result for completed quick scan.', {
        quickScanId,
        scannerJobId: payload.scannerJobId,
      });
      await this.deleteMessage(runtime, client, message.ReceiptHandle);
      return;
    }

    if (!payload.success) {
      const errorMessage = buildAuditFailureMessage(payload);
      const fallbackCount = Number(record.scannerFallbackCount || 0);
      const isVpsResult = payload.scannerTier === 'vps' || record.scannerTier === 'vps';
      const shouldFallbackToVps = env.scannerFallbackToVpsEnabled
        && Boolean(env.scannerSqsVpsQuickJobQueueUrl)
        && fallbackCount < env.scannerFallbackMaxAttempts
        && !isVpsResult
        && isScannerFailureEligibleForVpsFallback(payload);

      if (shouldFallbackToVps) {
        const fallbackBacklog = await QuickScan.countDocuments({
          scannerTier: 'vps',
          scannerQueueStatus: { $in: ['fallback_pending', 'queued'] },
          status: { $in: ['queued', 'processing'] },
        });

        if (fallbackBacklog >= env.scannerFallbackVpsQuickBacklogLimit) {
          resultWorkerLogger.warn('Skipping VPS fallback quick scan because fallback backlog limit is reached.', {
            quickScanId,
            scannerJobId: payload.scannerJobId,
            fallbackBacklog,
            fallbackBacklogLimit: env.scannerFallbackVpsQuickBacklogLimit,
          });
        } else {
          const fallbackScannerJobId = createScannerJobId();
          await QuickScan.updateOne({ _id: quickScanId }, {
            $set: {
              scannerTier: 'vps',
              fallbackScannerJobId,
              scannerQueueStatus: 'fallback_pending',
              scannerErrorCode: payload.errorCode || 'SCANNER_WORKER_FAILED',
              scannerResultAt: new Date(),
              emailError: undefined,
              errorMessage: undefined,
            },
            $inc: { scannerFallbackCount: 1 },
            $push: {
              scannerAttemptHistory: {
                scannerJobId: payload.scannerJobId,
                scannerTier: payload.scannerTier || 'aws',
                queueKind: 'quick',
                status: 'failed',
                errorCode: payload.errorCode || 'SCANNER_WORKER_FAILED',
                error: errorMessage,
                completedAt: new Date(),
              },
            },
          });

          const job = buildQuickScanJobFromRecord(record);
          const dispatchResult = await dispatchScannerAuditJob({
            url: payload.url || job.url,
            device: payload.device || job.selectedDevice || 'desktop',
            format: 'json',
            isLiteVersion: true,
            includeReport: true,
            scannerQueue: 'quick',
            scannerTier: 'vps',
            scannerJobId: fallbackScannerJobId,
          });

          if (dispatchResult.success) {
            await QuickScan.updateOne({ _id: quickScanId }, {
              $set: {
                status: 'processing',
                emailStatus: 'pending',
                scannerJobId: fallbackScannerJobId,
                scannerTier: 'vps',
                scannerQueueStatus: 'queued',
                scannerErrorCode: undefined,
              },
              $push: {
                scannerAttemptHistory: {
                  scannerJobId: fallbackScannerJobId,
                  scannerTier: 'vps',
                  queueKind: 'quick',
                  status: 'queued',
                  queuedAt: new Date(),
                },
              },
            });

            resultWorkerLogger.warn('Quick scanner result failed on AWS; queued VPS fallback scan.', {
              quickScanId,
              originalScannerJobId: payload.scannerJobId,
              fallbackScannerJobId,
              errorCode: payload.errorCode,
              error: errorMessage,
            });

            await this.deleteMessage(runtime, client, message.ReceiptHandle);
            return;
          }

          resultWorkerLogger.error('Failed to queue VPS fallback quick scan.', {
            quickScanId,
            originalScannerJobId: payload.scannerJobId,
            fallbackScannerJobId,
            dispatchErrorCode: dispatchResult.errorCode,
            dispatchError: dispatchResult.error,
          });
        }
      }

      await QuickScan.updateOne({ _id: quickScanId }, {
        $set: {
          status: 'failed',
          emailStatus: 'failed',
          emailError: errorMessage,
          errorMessage,
          scannerQueueStatus: 'failed',
          scannerErrorCode: payload.errorCode || 'SCANNER_WORKER_FAILED',
          scannerResultAt: new Date(),
          scannerTier: payload.scannerTier || record.scannerTier || 'aws',
        },
        $push: {
          scannerAttemptHistory: {
            scannerJobId: payload.scannerJobId,
            scannerTier: payload.scannerTier || record.scannerTier || 'aws',
            queueKind: 'quick',
            status: 'failed',
            errorCode: payload.errorCode || 'SCANNER_WORKER_FAILED',
            error: errorMessage,
            completedAt: new Date(),
          },
        },
      });

      resultWorkerLogger.error('Quick scanner result reported failure.', {
        quickScanId,
        scannerJobId: payload.scannerJobId,
        errorCode: payload.errorCode,
        error: errorMessage,
      });

      await this.deleteMessage(runtime, client, message.ReceiptHandle);
      return;
    }

    resultWorkerLogger.info('Processing quick scanner result.', {
      quickScanId,
      scannerJobId: payload.scannerJobId,
      url: payload.url || record.url,
      report: payload.report,
    });

    const job = buildQuickScanJobFromRecord(record);
    const reportPath = await downloadScannerS3Report(payload, {
      url: payload.url || job.url,
      device: payload.device || 'desktop',
      format: 'json',
      isLiteVersion: true,
      includeReport: true,
      scannerQueue: 'quick',
      scannerJobId: payload.scannerJobId,
    });

    await completeQuickScanFromAuditResult(job, {
      success: true,
      reportPath,
      isLiteVersion: payload.isLiteVersion ?? true,
      version: payload.version === 'Full' ? 'Full' : 'Lite',
      url: payload.url || job.url,
      device: payload.device || 'desktop',
      strategy: payload.strategy || 'Python-Camoufox-SQS',
      attemptNumber: payload.attemptNumber || 1,
      message: payload.message || 'Audit completed by scanner SQS worker.',
    });

    await QuickScan.updateOne({ _id: quickScanId }, {
      $set: {
        scannerQueueStatus: 'completed',
        scannerResultAt: new Date(),
        scannerErrorCode: undefined,
        scannerArtifact: payload.report,
        scannerTier: payload.scannerTier || record.scannerTier || 'aws',
      },
      $push: {
        scannerAttemptHistory: {
          scannerJobId: payload.scannerJobId,
          scannerTier: payload.scannerTier || record.scannerTier || 'aws',
          queueKind: 'quick',
          status: 'completed',
          completedAt: new Date(),
        },
      },
    });

    await this.deleteMessage(runtime, client, message.ReceiptHandle);

    resultWorkerLogger.info('Quick scanner result processed and deleted.', {
      quickScanId,
      scannerJobId: payload.scannerJobId,
    });
  }
}
