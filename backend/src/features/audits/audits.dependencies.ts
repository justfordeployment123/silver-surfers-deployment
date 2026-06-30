import type { Model } from 'mongoose';

import type { QueueReportStorage } from '../../infrastructure/queues/job-queue.ts';
import AnalysisRecord from '../../models/analysis-record.model.ts';
import QuickScan from '../../models/quick-scan.model.ts';
import Subscription from '../../models/subscription.model.ts';
import User from '../../models/user.model.ts';
import type { AuditAiReport } from './ai-reporting.ts';
import type { AuditScorecard } from './audit-scorecard.ts';
import type { FullAuditDevice, FullAuditScannerMode } from './full-audit.helpers.ts';
import type { WcagMatrix } from './wcag-mapping.ts';

export interface SubscriptionDocument {
  _id?: string;
  user?: string;
  status?: string;
  planId?: string;
  usage?: {
    scansThisMonth?: number;
  };
  limits?: {
    scansPerMonth?: number;
  };
}

interface UserDocument {
  _id?: string;
  oneTimeScans?: number;
}

export interface AnalysisRecordDocument {
  _id?: string;
  user?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  url?: string;
  taskId?: string;
  planId?: string | null;
  device?: string | null;
  score?: number | null;
  scoreCard?: AuditScorecard;
  aiReport?: AuditAiReport;
  wcagMatrix?: WcagMatrix;
  status?: string;
  emailStatus?: string;
  scannerJobId?: string | null;
  scannerQueueStatus?: string | null;
  scannerDispatchedAt?: Date;
  scannerResultAt?: Date;
  scannerArtifact?: Record<string, unknown>;
  emailAccepted?: string[];
  emailRejected?: string[];
  attachmentCount?: number;
  emailError?: string;
  reportDirectory?: string;
  reportStorage?: QueueReportStorage;
  warnings?: string[];
  plannedTargetCount?: number;
  successfulTargetCount?: number;
  degradedTargetCount?: number;
  failedTargetCount?: number;
  scanTargets?: Array<{
    url: string;
    device: FullAuditDevice;
    isHomepage?: boolean;
    scanModeUsed: FullAuditScannerMode;
    status: 'completed' | 'failed';
    score?: number | null;
    failureReason?: string;
    errorCode?: string;
    statusCode?: number;
  }>;
  autoRecoveryAttempts?: number;
  lastAutoRecoveryAt?: Date;
  reportFiles?: Array<{
    id?: string;
    filename?: string;
    relativePath?: string;
    storageKey?: string;
    providerUrl?: string;
    size?: number;
    sizeMB?: string;
    contentType?: string;
  }>;
  failureReason?: string;
  createdAt?: Date;
  updatedAt?: Date;
  save(): Promise<unknown>;
}

export interface QuickScanDocument {
  _id?: string;
  url?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  device?: string | null;
  status?: string;
  emailStatus?: string;
  emailError?: string | null;
  scannerJobId?: string | null;
  primaryScannerJobId?: string | null;
  fallbackScannerJobId?: string | null;
  scannerTier?: 'aws' | 'vps';
  scannerQueueStatus?: string;
  scannerResultAt?: Date;
  scannerErrorCode?: string | null;
  scannerArtifact?: Record<string, unknown>;
  scannerFallbackCount?: number;
  scannerAttemptHistory?: Array<Record<string, unknown>>;
  scanScore?: number | null;
  scoreCard?: AuditScorecard;
  wcagMatrix?: WcagMatrix;
  scanDate?: Date;
  reportGenerated?: boolean;
  reportPath?: string | null;
  reportDirectory?: string;
  aiReport?: AuditAiReport;
  reportStorage?: QueueReportStorage;
  autoRecoveryAttempts?: number;
  lastAutoRecoveryAt?: Date;
  reportFiles?: Array<{
    id?: string;
    filename?: string;
    relativePath?: string;
    storageKey?: string;
    providerUrl?: string;
    size?: number;
    sizeMB?: string;
    contentType?: string;
  }>;
  errorMessage?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  save(): Promise<unknown>;
}

export interface SubscriptionModel extends Model<SubscriptionDocument> {}
export interface UserModel extends Model<UserDocument> {}
export interface AnalysisRecordModel extends Model<AnalysisRecordDocument> {}
export interface QuickScanModel extends Model<QuickScanDocument> {}

export async function getSubscriptionModel(): Promise<SubscriptionModel> {
  return Subscription as unknown as SubscriptionModel;
}

export async function getUserModel(): Promise<UserModel> {
  return User as unknown as UserModel;
}

export async function getAnalysisRecordModel(): Promise<AnalysisRecordModel> {
  return AnalysisRecord as unknown as AnalysisRecordModel;
}

export async function getQuickScanModel(): Promise<QuickScanModel> {
  return QuickScan as unknown as QuickScanModel;
}
