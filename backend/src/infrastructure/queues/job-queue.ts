export type QueueJobInput = Record<string, unknown>;

export interface QueueStoredObject {
  filename: string;
  key?: string;
  size?: number;
  sizeMB?: string;
  fileId?: string;
  providerUrl?: string;
}

export interface QueueReportStorage {
  provider: string;
  bucket?: string;
  region?: string;
  prefix?: string;
  objectCount?: number;
  signedUrlExpiresInSeconds?: number;
  objects?: QueueStoredObject[];
}

export type QueueResult = {
  emailStatus?: string;
  attachmentCount?: number;
  reportDirectory?: string;
  reportStorage?: QueueReportStorage;
  scansUsed?: number;
};

export type QueueProcessor = (payload: QueueJobInput) => Promise<QueueResult>;

export type QueueStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface QueueStats {
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
}

export interface QueueJobDocument {
  _id: string;
  email: string;
  userId?: string;
  url: string;
  taskId: string;
  jobType: string;
  quickScanId?: string;
  firstName?: string;
  lastName?: string;
  planId?: string;
  selectedDevice?: string;
  subscriptionId?: string;
  priority?: number;
  status: QueueStatus;
  workerId?: string;
  maxAttempts?: number;
  retryAfter?: Date;
  retryCount?: number;
  attempts?: number;
  processingNode?: string;
  queueBackend?: string;
  reportDirectory?: string;
  reportStorage?: QueueReportStorage;
  lastError?: string;
  failureReason?: string;
  completedAt?: Date;
  save(): Promise<unknown>;
  complete(result?: QueueResult): Promise<unknown>;
  fail(
    error: string,
    failureReason: string,
    options?: { maxAttempts?: number; baseRetryDelayMs?: number },
  ): Promise<unknown>;
  canRetry(): boolean;
  resetForRetry(): Promise<unknown>;
}

export interface QueueModel {
  new (payload: QueueJobInput): QueueJobDocument;
  findById(id: string): Promise<QueueJobDocument | null>;
  findOne(query: Record<string, unknown>): Promise<QueueJobDocument | null>;
  find(query: Record<string, unknown>): {
    sort(sort: Record<string, 1 | -1>): Promise<QueueJobDocument[]>;
    limit?(count: number): Promise<QueueJobDocument[]>;
  };
  updateOne(
    query: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<{ matchedCount?: number; modifiedCount?: number }>;
  aggregate<T>(pipeline: object[]): Promise<T[]>;
  getNextJob(jobType?: string, workerId?: string, leaseDurationMs?: number): Promise<QueueJobDocument | null>;
  getFailedJobs(jobType?: string, limit?: number): Promise<QueueJobDocument[]>;
  getStaleProcessingJobs(jobType?: string, now?: Date, limit?: number): Promise<QueueJobDocument[]>;
  renewLease(
    jobId: string,
    workerId: string,
    leaseDurationMs?: number,
  ): Promise<{ matchedCount?: number; modifiedCount?: number }>;
  cleanupOldJobs(daysOld?: number): Promise<unknown>;
}

export interface QueueOptions {
  concurrency?: number;
  maxRetries?: number;
  retryDelay?: number;
  cleanupInterval?: number;
  jobTimeoutMs?: number;
  maintenanceIntervalMs?: number;
  leaseDurationMs?: number;
  heartbeatIntervalMs?: number;
  recoveryBatchSize?: number;
  lockDurationMs?: number;
  lockRenewTimeMs?: number;
  stalledIntervalMs?: number;
  maxStalledCount?: number;
  recoverProcessingJobs?: boolean;
}

export interface JobQueue {
  start(): Promise<void>;
  stop(): Promise<void>;
  addJob(jobData: QueueJobInput): Promise<QueueJobDocument>;
  recoverJobs(): Promise<void>;
  getStats(): Promise<QueueStats>;
}
