import { env } from '../../config/env.ts';
import { logger } from '../../config/logger.ts';
import {
  buildQuickScanJobFromRecord,
  completeQuickScanFromAuditResult,
} from '../audits/quick-scan.processor.ts';
import { getQuickScanModel } from '../audits/audits.dependencies.ts';
import {
  downloadScannerS3Report,
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
    const record = await QuickScan.findOne({ scannerJobId: payload.scannerJobId });

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
      await QuickScan.findByIdAndUpdate(quickScanId, {
        status: 'failed',
        emailStatus: 'failed',
        emailError: errorMessage,
        errorMessage,
        scannerQueueStatus: 'failed',
        scannerErrorCode: payload.errorCode || 'SCANNER_WORKER_FAILED',
        scannerResultAt: new Date(),
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

    await QuickScan.findByIdAndUpdate(quickScanId, {
      scannerQueueStatus: 'completed',
      scannerResultAt: new Date(),
      scannerErrorCode: undefined,
      scannerArtifact: payload.report,
    });

    await this.deleteMessage(runtime, client, message.ReceiptHandle);

    resultWorkerLogger.info('Quick scanner result processed and deleted.', {
      quickScanId,
      scannerJobId: payload.scannerJobId,
    });
  }
}
