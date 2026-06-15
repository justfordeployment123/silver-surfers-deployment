import type { Model } from 'mongoose';

import type { QueueReportStorage } from '../../infrastructure/queues/job-queue.ts';
import AnalysisRecord from '../../models/analysis-record.model.ts';
import User from '../../models/user.model.ts';
import * as authEmailService from './auth-email.service.ts';
import type { AuditScorecard } from '../audits/audit-scorecard.ts';

interface UserDocument {
  _id: { toString(): string } | string;
  email: string;
  role: string;
  verified: boolean;
  accountStatus?: 'active' | 'suspended';
  passwordHash?: string;
  verificationTokenHash?: string;
  verificationExpires?: Date;
  resetTokenHash?: string;
  resetExpires?: Date;
  save(): Promise<unknown>;
}

interface AnalysisRecordDocument {
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
  status?: string;
  emailStatus?: string;
  attachmentCount?: number;
  failureReason?: string;
  emailError?: string;
  reportDirectory?: string;
  reportStorage?: QueueReportStorage;
  warnings?: string[];
  plannedTargetCount?: number;
  successfulTargetCount?: number;
  degradedTargetCount?: number;
  failedTargetCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface UserModel extends Model<UserDocument> {
  create(payload: Record<string, unknown>): Promise<UserDocument>;
}

interface AnalysisRecordModel extends Model<AnalysisRecordDocument> {}

interface EmailModule {
  sendVerificationEmail(email: string, token: string): Promise<unknown>;
  sendPasswordResetEmail(email: string, token: string): Promise<unknown>;
}

export async function getUserModel(): Promise<UserModel> {
  return User as unknown as UserModel;
}

export async function getAnalysisRecordModel(): Promise<AnalysisRecordModel> {
  return AnalysisRecord as unknown as AnalysisRecordModel;
}

export async function getEmailModule(): Promise<EmailModule> {
  return authEmailService satisfies EmailModule;
}
