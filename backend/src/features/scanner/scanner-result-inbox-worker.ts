import { env } from '../../config/env.ts';
import { logger } from '../../config/logger.ts';
import ScannerResult from '../../models/scanner-result.model.ts';
import {
  loadSqsRuntime,
  parseSqsResultBody,
  type ScannerSqsResultPayload,
} from './scanner-client.ts';

const inboxLogger = logger.child('feature:scanner:result-inbox-worker');

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

export class ScannerResultInboxWorker {
  private running = false;
  private loopPromise: Promise<void> | undefined;

  constructor(
    private readonly queueKind: 'full',
    private readonly queueUrl: string,
  ) {}

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
    if (!env.scannerSqsArtifactRegion) {
      inboxLogger.warn('Scanner result inbox worker not started; AWS region is missing.', {
        queueKind: this.queueKind,
      });
      return;
    }

    const runtime = await loadSqsRuntime();
    const client = new runtime.SQSClient({ region: env.scannerSqsArtifactRegion });

    inboxLogger.info('Scanner result inbox worker started.', {
      queueKind: this.queueKind,
      queueUrl: this.queueUrl,
    });

    while (this.running) {
      try {
        const response = await client.send(new runtime.ReceiveMessageCommand({
          QueueUrl: this.queueUrl,
          MaxNumberOfMessages: env.scannerSqsResultWorkerMaxMessages,
          WaitTimeSeconds: env.scannerSqsWaitTimeSeconds,
          VisibilityTimeout: env.scannerSqsResultWorkerVisibilityTimeoutSeconds,
        }));

        for (const message of response.Messages || []) {
          if (!this.running) {
            break;
          }

          await this.handleMessage(runtime, client, message);
        }
      } catch (error) {
        inboxLogger.error('Scanner result inbox worker poll failed.', {
          queueKind: this.queueKind,
          error: error instanceof Error ? error.message : String(error),
        });
        await sleep(5_000);
      }
    }

    inboxLogger.info('Scanner result inbox worker stopped.', {
      queueKind: this.queueKind,
    });
  }

  private async deleteMessage(
    runtime: Awaited<ReturnType<typeof loadSqsRuntime>>,
    client: InstanceType<Awaited<ReturnType<typeof loadSqsRuntime>>['SQSClient']>,
    receiptHandle: string | undefined,
  ): Promise<void> {
    if (!receiptHandle) {
      return;
    }

    await client.send(new runtime.DeleteMessageCommand({
      QueueUrl: this.queueUrl,
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
      inboxLogger.warn('Discarding scanner result without scannerJobId.', {
        queueKind: this.queueKind,
        messageId: message.MessageId,
      });
      await this.deleteMessage(runtime, client, message.ReceiptHandle);
      return;
    }

    await ScannerResult.updateOne(
      { scannerJobId: payload.scannerJobId },
      {
        $set: {
          queueKind: this.queueKind,
          payload: payload satisfies ScannerSqsResultPayload,
          receivedAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      },
      { upsert: true },
    );

    await this.deleteMessage(runtime, client, message.ReceiptHandle);

    inboxLogger.info('Scanner result stored in inbox.', {
      queueKind: this.queueKind,
      scannerJobId: payload.scannerJobId,
      success: payload.success,
      url: payload.url,
    });
  }
}
