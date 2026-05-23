import { logger } from '../../config/logger.ts';
import { getQueueModel } from './audit-job-model.ts';
import type {
  JobQueue,
  QueueJobDocument,
  QueueJobInput,
  QueueModel,
  QueueOptions,
  QueueProcessor,
  QueueResult,
  QueueStats,
} from './job-queue.ts';

type BullMqModule = {
  Queue: new (name: string, options: Record<string, unknown>) => BullQueueInstance;
  Worker: new (
    name: string,
    processor: (job: BullJobInstance) => Promise<unknown>,
    options: Record<string, unknown>,
  ) => BullWorkerInstance;
  QueueEvents: new (name: string, options: Record<string, unknown>) => BullQueueEventsInstance;
};

type IORedisConstructor = new (url: string, options: Record<string, unknown>) => BullRedisConnection;

interface BullRuntime {
  Queue: BullMqModule['Queue'];
  Worker: BullMqModule['Worker'];
  QueueEvents: BullMqModule['QueueEvents'];
  IORedis: IORedisConstructor;
}

interface BullRedisConnection {
  quit(): Promise<unknown>;
  disconnect(): void;
}

interface BullJobInstance {
  id?: string;
  data: QueueJobInput;
  attemptsMade: number;
  getState?(): Promise<string>;
  remove?(): Promise<void>;
  opts: {
    attempts?: number;
  };
}

interface BullQueueInstance {
  add(name: string, data: QueueJobInput, options: Record<string, unknown>): Promise<unknown>;
  getJob(jobId: string): Promise<unknown>;
  close(): Promise<void>;
}

interface BullWorkerInstance {
  on(event: string, listener: (...args: unknown[]) => void): BullWorkerInstance;
  close(): Promise<void>;
}

interface BullQueueEventsInstance {
  on(event: string, listener: (...args: unknown[]) => void): BullQueueEventsInstance;
  close(): Promise<void>;
}

interface BullMqConnectionOptions {
  redisUrl?: string;
  prefix?: string;
}

const bullLogger = logger.child('queue:bullmq');

function computeRetryDelay(baseDelayMs: number, attemptNumber: number): number {
  return Math.min(baseDelayMs * Math.pow(2, Math.max(attemptNumber - 1, 0)), 300000);
}

function normalizeJobPayload(jobData: QueueJobInput): QueueJobInput {
  return JSON.parse(JSON.stringify(jobData)) as QueueJobInput;
}

function buildReportDirectory(reportStorage: QueueResult['reportStorage'], fallback: string | undefined): string | undefined {
  if (reportStorage?.provider === 's3' && reportStorage.bucket && reportStorage.prefix) {
    return `s3://${reportStorage.bucket}/${reportStorage.prefix}`;
  }

  return fallback;
}

function clearProcessingState(job: QueueJobDocument): void {
  job.processingNode = undefined;
  job.workerId = undefined;
}

function isTerminalBullJobState(state: string): boolean {
  return state === 'completed' || state === 'failed';
}

async function loadBullRuntime(): Promise<BullRuntime> {
  const [bullmqModule, ioredisModule] = await Promise.all([
    import('bullmq') as Promise<BullMqModule>,
    import('ioredis') as Promise<{ default?: IORedisConstructor } & Record<string, unknown>>,
  ]);

  const IORedis = (ioredisModule.default ?? ioredisModule) as unknown as IORedisConstructor;
  return {
    Queue: bullmqModule.Queue,
    Worker: bullmqModule.Worker,
    QueueEvents: bullmqModule.QueueEvents,
    IORedis,
  };
}

export class BullMqQueue implements JobQueue {
  readonly #queueName: string;
  readonly #jobType: string;
  readonly #processJob: QueueProcessor;
  readonly #options: Required<QueueOptions>;
  readonly #logger;
  readonly #redisUrl?: string;
  readonly #prefix?: string;
  readonly #workerId: string;

  #queue: BullQueueInstance | undefined;
  #worker: BullWorkerInstance | undefined;
  #queueEvents: BullQueueEventsInstance | undefined;
  #connections: BullRedisConnection[] = [];
  #runtime: BullRuntime | undefined;
  #isStarted = false;

  constructor(
    queueName: string,
    processJob: QueueProcessor,
    options: QueueOptions = {},
    connectionOptions: BullMqConnectionOptions = {},
  ) {
    this.#queueName = queueName;
    this.#jobType = queueName === 'FullAudit' ? 'full-audit' : 'quick-scan';
    this.#processJob = processJob;
    this.#options = {
      concurrency: options.concurrency ?? 1,
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 5000,
      cleanupInterval: options.cleanupInterval ?? 300000,
      jobTimeoutMs: options.jobTimeoutMs ?? (this.#jobType === 'full-audit' ? 180 * 60 * 1000 : 10 * 60 * 1000),
      maintenanceIntervalMs: options.maintenanceIntervalMs ?? 30000,
      leaseDurationMs: options.leaseDurationMs ?? 60000,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? 15000,
      recoveryBatchSize: options.recoveryBatchSize ?? 100,
      lockDurationMs: options.lockDurationMs ?? 30 * 60 * 1000,
      lockRenewTimeMs: options.lockRenewTimeMs ?? 15 * 60 * 1000,
      stalledIntervalMs: options.stalledIntervalMs ?? 5 * 60 * 1000,
      maxStalledCount: options.maxStalledCount ?? 0,
      recoverProcessingJobs: options.recoverProcessingJobs ?? false,
    };
    this.#logger = bullLogger.child(queueName);
    this.#redisUrl = connectionOptions.redisUrl;
    this.#prefix = connectionOptions.prefix;
    this.#workerId = `${this.#jobType}-bullmq-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async start(): Promise<void> {
    if (this.#isStarted) {
      return;
    }

    await this.ensureRuntime();
    await this.recoverJobs();
    this.#worker = new this.#runtime!.Worker(
      this.#queueName,
      async (job) => this.processBullJob(job),
      {
        connection: this.createConnection(),
        concurrency: this.#options.concurrency,
        prefix: this.#prefix,
        lockDuration: this.#options.lockDurationMs,
        lockRenewTime: this.#options.lockRenewTimeMs,
        stalledInterval: this.#options.stalledIntervalMs,
        maxStalledCount: this.#options.maxStalledCount,
      },
    );

    this.#worker.on('completed', (job: BullJobInstance) => {
      this.#logger.info('BullMQ job completed.', {
        taskId: job?.data?.taskId,
      });
    });

    this.#worker.on('failed', (job: BullJobInstance | undefined, error: Error) => {
      this.#logger.error('BullMQ job failed.', {
        taskId: job?.data?.taskId,
        error: error?.message,
      });
    });

    this.#queueEvents = new this.#runtime!.QueueEvents(this.#queueName, {
      connection: this.createConnection(),
      prefix: this.#prefix,
    });

    this.#queueEvents.on('stalled', ({ jobId }: { jobId?: string }) => {
      this.#logger.warn('BullMQ reported a stalled job.', { jobId });
    });

    this.#isStarted = true;
    this.#logger.info('BullMQ queue started.', {
      concurrency: this.#options.concurrency,
      redisUrl: this.maskRedisUrl(this.#redisUrl),
      prefix: this.#prefix,
      workerId: this.#workerId,
      lockDurationMs: this.#options.lockDurationMs,
      lockRenewTimeMs: this.#options.lockRenewTimeMs,
      stalledIntervalMs: this.#options.stalledIntervalMs,
      maxStalledCount: this.#options.maxStalledCount,
      jobTimeoutMs: this.#options.jobTimeoutMs,
      recoverProcessingJobs: this.#options.recoverProcessingJobs,
    });
  }

  async stop(): Promise<void> {
    this.#isStarted = false;

    await this.#worker?.close().catch((error: unknown) => {
      this.#logger.warn('Failed to close BullMQ worker cleanly.', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    this.#worker = undefined;

    await this.#queueEvents?.close().catch((error: unknown) => {
      this.#logger.warn('Failed to close BullMQ queue events cleanly.', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    this.#queueEvents = undefined;

    await this.#queue?.close().catch((error: unknown) => {
      this.#logger.warn('Failed to close BullMQ queue cleanly.', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    this.#queue = undefined;

    await Promise.all(this.#connections.map(async (connection) => {
      try {
        await connection.quit();
      } catch {
        connection.disconnect();
      }
    }));
    this.#connections = [];
  }

  async addJob(jobData: QueueJobInput): Promise<QueueJobDocument> {
    await this.ensureRuntime();

    const AuditJob = await getQueueModel();
    const taskId = String(jobData.taskId ?? '');
    let job = taskId ? await AuditJob.findOne({ taskId }) : null;

    if (!job) {
      job = new AuditJob({
        ...jobData,
        jobType: this.#jobType,
        status: 'queued',
        queuedAt: new Date(),
        maxAttempts: Number(jobData.maxAttempts) > 0 ? Number(jobData.maxAttempts) : this.#options.maxRetries,
        queueBackend: 'bullmq',
      });
      await job.save();
    } else {
      job.queueBackend = 'bullmq';
      job.maxAttempts = job.maxAttempts ?? this.#options.maxRetries;
      job.status = 'queued';
      await job.save();
    }

    const serializedPayload = normalizeJobPayload({
      ...jobData,
      taskId: job.taskId,
      jobType: this.#jobType,
    });

    const existingJob = await this.#queue!.getJob(job.taskId);
    if (existingJob) {
      const state = await existingJob.getState?.().catch(() => 'unknown') || 'unknown';

      if (isTerminalBullJobState(state) && existingJob.remove) {
        await existingJob.remove();
        this.#logger.warn('Removed terminal BullMQ job before requeueing task.', {
          taskId: job.taskId,
          jobType: this.#jobType,
          previousState: state,
        });
      } else {
        this.#logger.info('BullMQ job already exists; skipping duplicate enqueue.', {
          taskId: job.taskId,
          jobType: this.#jobType,
          existingState: state,
        });
        return job;
      }
    }

    await this.#queue!.add(this.#jobType, serializedPayload, {
      jobId: job.taskId,
      attempts: job.maxAttempts ?? this.#options.maxRetries,
      backoff: {
        type: 'exponential',
        delay: this.#options.retryDelay,
      },
      removeOnComplete: false,
      removeOnFail: false,
      priority: typeof jobData.priority === 'number' ? Number(jobData.priority) : 0,
    });

    this.#logger.info('BullMQ job queued.', {
      taskId: job.taskId,
      jobType: this.#jobType,
    });

    return job;
  }

  async recoverJobs(): Promise<void> {
    await this.ensureRuntime();

    const AuditJob = await getQueueModel();
    const recoverableStatuses = this.#options.recoverProcessingJobs
      ? ['queued', 'processing', 'failed']
      : ['queued', 'failed'];
    const recoverableJobs = await AuditJob.find({
      jobType: this.#jobType,
      status: { $in: recoverableStatuses },
    }).sort({ priority: -1, queuedAt: 1 });

    const now = Date.now();

    for (const job of recoverableJobs) {
      const existingJob = await this.#queue!.getJob(job.taskId);
      if (existingJob) {
        const state = await existingJob.getState?.().catch(() => 'unknown') || 'unknown';
        const isRecoverableStatus = job.status === 'queued' || job.status === 'processing' || job.status === 'failed';

        if (isRecoverableStatus && isTerminalBullJobState(state) && existingJob.remove) {
          await existingJob.remove();
          this.#logger.warn('Removed terminal BullMQ job during recovery so task can be rehydrated.', {
            taskId: job.taskId,
            jobType: this.#jobType,
            mongoStatus: job.status,
            previousBullState: state,
          });
        } else {
          continue;
        }
      }

      const hasRetriesRemaining = (job.retryCount ?? 0) < (job.maxAttempts ?? this.#options.maxRetries);
      const retryAt = job.retryAfter?.getTime() ?? now;
      const isRecoverableFailure = job.status === 'failed' && hasRetriesRemaining;

      if (job.status === 'failed' && !isRecoverableFailure) {
        continue;
      }

      job.status = 'queued';
      job.queueBackend = 'bullmq';
      job.retryAfter = undefined;
      clearProcessingState(job);
      await job.save();

      const delay = Math.max(retryAt - now, 0);
      await this.#queue!.add(this.#jobType, normalizeJobPayload(this.buildJobPayload(job)), {
        jobId: job.taskId,
        attempts: job.maxAttempts ?? this.#options.maxRetries,
        delay,
        backoff: {
          type: 'exponential',
          delay: this.#options.retryDelay,
        },
        removeOnComplete: false,
        removeOnFail: false,
        priority: job.priority ?? 0,
      });

      this.#logger.warn('Recovered Mongo-backed job into BullMQ.', {
        taskId: job.taskId,
        delayMs: delay,
        previousStatus: isRecoverableFailure ? 'failed' : job.status,
      });
    }
  }

  async getStats(): Promise<QueueStats> {
    const AuditJob = await getQueueModel();
    const rows = await AuditJob.aggregate<{ _id: QueueJobDocument['status']; count: number }>([
      { $match: { jobType: this.#jobType } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    return rows.reduce<QueueStats>((stats, row) => {
      stats[row._id] = row.count;
      return stats;
    }, {
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    });
  }

  private async ensureRuntime(): Promise<void> {
    if (this.#queue) {
      return;
    }

    if (!this.#redisUrl) {
      throw new Error(`BullMQ queue "${this.#queueName}" requires REDIS_URL or QUEUE_REDIS_URL.`);
    }

    this.#runtime = await loadBullRuntime();
    this.#queue = new this.#runtime.Queue(this.#queueName, {
      connection: this.createConnection(),
      prefix: this.#prefix,
      defaultJobOptions: {
        attempts: this.#options.maxRetries,
        backoff: {
          type: 'exponential',
          delay: this.#options.retryDelay,
        },
        removeOnComplete: false,
        removeOnFail: false,
      },
    });
  }

  private createConnection(): BullRedisConnection {
    const connection = new this.#runtime!.IORedis(this.#redisUrl!, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    this.#connections.push(connection);
    return connection;
  }

  private async processBullJob(bullJob: BullJobInstance): Promise<QueueResult> {
    const AuditJob = await getQueueModel();
    const taskId = String(bullJob.data.taskId ?? bullJob.id ?? '');
    const jobDoc = await this.ensureJobDocument(AuditJob, bullJob.data, taskId);

    jobDoc.status = 'processing';
    jobDoc.queueBackend = 'bullmq';
    jobDoc.workerId = this.#workerId;
    jobDoc.processingNode = this.#workerId;
    jobDoc.attempts = Math.max(jobDoc.attempts ?? 0, bullJob.attemptsMade + 1);
    await jobDoc.save();

    try {
      const result = await Promise.race<QueueResult>([
        this.#processJob(bullJob.data),
        new Promise<QueueResult>((_, reject) => {
          setTimeout(() => reject(new Error(`Job exceeded timeout of ${this.#options.jobTimeoutMs}ms`)), this.#options.jobTimeoutMs);
        }),
      ]);

      jobDoc.queueBackend = 'bullmq';
      jobDoc.reportDirectory = buildReportDirectory(result.reportStorage, result.reportDirectory);
      jobDoc.reportStorage = result.reportStorage;
      await jobDoc.complete({
        ...result,
        reportDirectory: jobDoc.reportDirectory,
        reportStorage: result.reportStorage,
      });
      return {
        ...result,
        reportDirectory: jobDoc.reportDirectory,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const currentAttempt = bullJob.attemptsMade + 1;
      const maxAttempts = bullJob.opts.attempts ?? jobDoc.maxAttempts ?? this.#options.maxRetries;
      const willRetry = currentAttempt < maxAttempts;

      await jobDoc.fail(errorMessage, errorMessage, {
        maxAttempts,
        baseRetryDelayMs: this.#options.retryDelay,
      });

      jobDoc.queueBackend = 'bullmq';
      if (willRetry) {
        jobDoc.status = 'queued';
        jobDoc.completedAt = undefined;
        jobDoc.retryAfter = new Date(Date.now() + computeRetryDelay(this.#options.retryDelay, currentAttempt));
        clearProcessingState(jobDoc);
        await jobDoc.save();
      }

      this.#logger.error('Queue job failed.', {
        taskId,
        error: errorMessage,
        canRetry: willRetry,
        attempt: currentAttempt,
        maxAttempts,
      });

      throw (error instanceof Error) ? error : new Error(errorMessage);
    }
  }

  private async ensureJobDocument(AuditJob: QueueModel, payload: QueueJobInput, taskId: string): Promise<QueueJobDocument> {
    let job = taskId ? await AuditJob.findOne({ taskId }) : null;

    if (!job) {
      job = new AuditJob({
        ...payload,
        taskId,
        jobType: this.#jobType,
        status: 'queued',
        queuedAt: new Date(),
        queueBackend: 'bullmq',
      });
      await job.save();
    }

    return job;
  }

  private buildJobPayload(job: QueueJobDocument): QueueJobInput {
    return {
      email: job.email,
      userId: job.userId,
      url: job.url,
      taskId: job.taskId,
      jobType: job.jobType,
      quickScanId: job.quickScanId,
      firstName: job.firstName,
      lastName: job.lastName,
      planId: job.planId,
      selectedDevice: job.selectedDevice,
      subscriptionId: job.subscriptionId,
      priority: job.priority,
      maxAttempts: job.maxAttempts,
    };
  }

  private maskRedisUrl(value: string | undefined): string | undefined {
    if (!value) {
      return undefined;
    }

    return value.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
  }
}
