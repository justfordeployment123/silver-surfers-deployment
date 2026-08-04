import type { Model } from 'mongoose';

import MonitoringJob from '../../models/monitoring-job.model.ts';
import MonitoringRun from '../../models/monitoring-run.model.ts';
import NotificationLog from '../../models/notification-log.model.ts';

export type MonitoringSchedule = 'weekly' | 'biweekly' | 'monthly' | 'trimonthly' | 'quarterly' | 'custom';
export type MonitoringScanType = 'quick' | 'full';
export type MonitoringWcagStandard = 'wcag21' | 'wcag22' | 'combined';
export type MonitoringConformanceLevel = 'A' | 'AA' | 'AAA';
export type MonitoringDevice = 'desktop' | 'tablet' | 'mobile';
export type MonitoringJobStatus = 'active' | 'paused' | 'error';
export type MonitoringRunStatus = 'pending' | 'running' | 'complete' | 'failed';
export type NotificationType = 'run_complete' | 'score_drop' | 'new_issues';
export type NotificationStatus = 'sent' | 'failed';

export interface MonitoringJobDocument {
  _id?: string;
  userId?: string;
  domain?: string;
  schedule?: MonitoringSchedule;
  customCronExpression?: string;
  scanType?: MonitoringScanType;
  wcagStandard?: MonitoringWcagStandard;
  conformanceLevel?: MonitoringConformanceLevel;
  devicesEnabled?: MonitoringDevice[];
  maxPages?: number;
  status?: MonitoringJobStatus;
  nextRunAt?: Date;
  lastRunAt?: Date;
  lastRunScore?: number;
  alertThreshold?: number;
  alertEmails?: string[];
  notifyOnComplete?: boolean;
  notifyOnNewIssues?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  save(): Promise<unknown>;
}

export interface MonitoringRunDocument {
  _id?: string;
  jobId?: string;
  userId?: string;
  auditId?: string;
  auditModel?: 'AnalysisRecord' | 'QuickScan';
  wcagStandard?: MonitoringWcagStandard;
  conformanceLevel?: MonitoringConformanceLevel;
  triggeredAt?: Date;
  completedAt?: Date;
  score?: number;
  scoreDelta?: number;
  status?: MonitoringRunStatus;
  errorMessage?: string;
  issueCount?: number;
  newIssueCount?: number;
  resolvedIssueCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
  save(): Promise<unknown>;
}

export interface NotificationLogDocument {
  _id?: string;
  jobId?: string;
  runId?: string;
  userId?: string;
  type?: NotificationType;
  recipients?: string[];
  subject?: string;
  status?: NotificationStatus;
  errorMessage?: string;
  messageId?: string;
  sentAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MonitoringJobModel extends Model<MonitoringJobDocument> {}
export interface MonitoringRunModel extends Model<MonitoringRunDocument> {}
export interface NotificationLogModel extends Model<NotificationLogDocument> {}

export async function getMonitoringJobModel(): Promise<MonitoringJobModel> {
  return MonitoringJob as unknown as MonitoringJobModel;
}

export async function getMonitoringRunModel(): Promise<MonitoringRunModel> {
  return MonitoringRun as unknown as MonitoringRunModel;
}

export async function getNotificationLogModel(): Promise<NotificationLogModel> {
  return NotificationLog as unknown as NotificationLogModel;
}
