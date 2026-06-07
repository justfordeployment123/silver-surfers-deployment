import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

import { env } from '../../config/env.ts';
import { logger } from '../../config/logger.ts';
import { asyncHandler } from '../../shared/http/async-handler.ts';
import { buildAnalysisDetail } from '../audits/analysis-details.ts';
import { getQuickScanModel } from '../audits/audits.dependencies.ts';
import { listAnalysisReportFiles, sendAnalysisReportFile } from '../audits/analysis-reports.ts';
import { getAuditQueues } from '../audits/audits.runtime.ts';
import { getAnalysisRecordModel, getEmailModule, getUserModel } from './auth.dependencies.ts';
import { authRequired, decodeAuthToken, readBearerToken } from './auth.middleware.ts';

const authLogger = logger.child('feature:auth');
const router = Router();

function signToken(user: { _id: { toString(): string } | string; email: string; role?: string }): string {
  return jwt.sign(
    {
      id: typeof user._id === 'string' ? user._id : user._id.toString(),
      email: user.email,
      role: user.role || 'user',
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn },
  );
}

function randomToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function buildOwnedAnalysisQuery(user: { id?: string; email?: string } | undefined): Record<string, unknown> {
  return {
    $or: [
      { user: user?.id },
      { email: user?.email },
    ],
  };
}

function buildOwnedQuickScanQuery(user: { email?: string } | undefined): Record<string, unknown> {
  return {
    email: String(user?.email || '').toLowerCase(),
  };
}

function isValidObjectId(value: string): boolean {
  return /^[a-f0-9]{24}$/i.test(value);
}

function createTaskId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isActiveScanStatus(status: string | undefined): boolean {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'queued' || normalized === 'processing';
}

function normalizeQuickScanDevice(value: unknown): 'desktop' | 'mobile' | 'tablet' {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'mobile' || normalized === 'tablet') {
    return normalized;
  }

  return 'desktop';
}

function isQuickScanAiSummaryFilename(filename: string | undefined): boolean {
  return String(filename || '').toLowerCase().includes('ai-executive-summary');
}

function filterStoredQuickScanAiSummary<T extends { filename?: string }>(reportFiles: T[] | undefined): T[] {
  if (!Array.isArray(reportFiles)) {
    return [];
  }

  return reportFiles.filter((file) => !isQuickScanAiSummaryFilename(file?.filename));
}

router.post('/register', asyncHandler(async (request, response) => {
  const User = await getUserModel();
  const emailModule = await getEmailModule();

  let { email, password } = request.body ?? {};
  if (!email || !password) {
    response.status(400).json({ error: 'Email and password required' });
    return;
  }

  email = String(email).trim().toLowerCase();
  password = String(password);

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    response.status(409).json({ error: 'User already exists' });
    return;
  }

  if (password.length < 6) {
    response.status(400).json({ error: 'Password must be at least 6 characters' });
    return;
  }

  const verificationToken = randomToken();
  const user = await User.create({
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role: 'user',
    provider: 'local',
    verified: false,
    verificationTokenHash: hashToken(verificationToken),
    verificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  try {
    await emailModule.sendVerificationEmail(email, verificationToken);
  } catch (error) {
    authLogger.warn('Verification email failed during registration.', {
      email,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  response.status(201).json({
    message: 'Registered. Please verify your email.',
    user: {
      email: user.email,
      role: user.role,
      verified: false,
    },
  });
}));

router.post('/verify-email', asyncHandler(async (request, response) => {
  const User = await getUserModel();
  const { token } = request.body ?? {};

  if (!token) {
    response.status(400).json({ error: 'Token required' });
    return;
  }

  const user = await User.findOne({
    verificationTokenHash: hashToken(String(token)),
    verificationExpires: { $gt: new Date() },
  });

  if (!user) {
    response.status(400).json({ error: 'Invalid or expired token' });
    return;
  }

  user.verified = true;
  user.verificationTokenHash = undefined;
  user.verificationExpires = undefined;
  await user.save();

  response.json({
    token: signToken(user),
    user: {
      email: user.email,
      role: user.role,
      verified: true,
    },
  });
}));

router.post('/resend-verification', asyncHandler(async (request, response) => {
  const User = await getUserModel();
  const emailModule = await getEmailModule();
  const { email } = request.body ?? {};

  if (!email) {
    response.status(400).json({ error: 'Email required' });
    return;
  }

  const user = await User.findOne({ email: String(email).trim().toLowerCase() });
  if (!user) {
    response.status(404).json({ error: 'User not found' });
    return;
  }

  if (user.verified) {
    response.status(400).json({ error: 'Already verified' });
    return;
  }

  const verificationToken = randomToken();
  user.verificationTokenHash = hashToken(verificationToken);
  user.verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save();

  try {
    await emailModule.sendVerificationEmail(user.email, verificationToken);
  } catch (error) {
    authLogger.warn('Verification email failed during resend.', {
      email: user.email,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  response.json({ message: 'Verification email sent' });
}));

router.post('/login', asyncHandler(async (request, response) => {
  const User = await getUserModel();
  const { email, password } = request.body ?? {};

  if (!email || !password) {
    response.status(400).json({ error: 'Email and password required' });
    return;
  }

  const user = await User.findOne({ email: String(email).trim().toLowerCase() });
  if (!user || !(await bcrypt.compare(String(password), user.passwordHash || ''))) {
    response.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  if (!user.verified) {
    response.status(403).json({ error: 'Email not verified' });
    return;
  }

  response.json({
    token: signToken(user),
    user: {
      email: user.email,
      role: user.role,
      verified: true,
    },
  });
}));

router.post('/forgot-password', asyncHandler(async (request, response) => {
  const User = await getUserModel();
  const emailModule = await getEmailModule();
  const { email } = request.body ?? {};

  if (!email) {
    response.status(400).json({ error: 'Email required' });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });

  if (user) {
    const resetToken = randomToken();
    user.resetTokenHash = hashToken(resetToken);
    user.resetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    try {
      await emailModule.sendPasswordResetEmail(user.email, resetToken);
    } catch (error) {
      authLogger.warn('Password reset email failed.', {
        email: user.email,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  response.json({ message: 'If that email exists, a reset link has been sent.' });
}));

router.post('/reset-password', asyncHandler(async (request, response) => {
  const User = await getUserModel();
  const { token, password } = request.body ?? {};

  if (!token || !password) {
    response.status(400).json({ error: 'Token and new password required' });
    return;
  }

  if (String(password).length < 6) {
    response.status(400).json({ error: 'Password must be at least 6 characters' });
    return;
  }

  const user = await User.findOne({
    resetTokenHash: hashToken(String(token)),
    resetExpires: { $gt: new Date() },
  });

  if (!user) {
    response.status(400).json({ error: 'Invalid or expired token' });
    return;
  }

  user.passwordHash = await bcrypt.hash(String(password), 10);
  user.resetTokenHash = undefined;
  user.resetExpires = undefined;
  await user.save();

  response.json({
    message: 'Password has been reset.',
    token: signToken(user),
    user: {
      email: user.email,
      role: user.role,
      verified: user.verified,
    },
  });
}));

router.get('/me', asyncHandler(async (request, response) => {
  const User = await getUserModel();
  const token = readBearerToken(request);

  if (!token) {
    response.status(200).json({ user: null });
    return;
  }

  try {
    const payload = decodeAuthToken(token);
    const user = await User.findById(payload.id).lean();

    if (!user) {
      response.status(200).json({ user: null });
      return;
    }

    response.json({
      user: {
        email: user.email,
        role: user.role,
        verified: user.verified,
      },
    });
  } catch {
    response.status(200).json({ user: null });
  }
}));

router.get('/my-analysis', authRequired, asyncHandler(async (request, response) => {
  const AnalysisRecord = await getAnalysisRecordModel();
  const user = request.user;
  const limit = Number(request.query.limit) || 50;

  const items = await AnalysisRecord.find(buildOwnedAnalysisQuery(user))
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  response.json({ items });
}));

router.get('/my-quick-scans', authRequired, asyncHandler(async (request, response) => {
  const QuickScan = await getQuickScanModel();
  const user = request.user;
  const limit = Number(request.query.limit) || 50;

  const items = await QuickScan.find(buildOwnedQuickScanQuery(user))
    .sort({ scanDate: -1, createdAt: -1 })
    .limit(limit)
    .lean();

  response.json({ items });
}));

router.post('/my-analysis/:taskId/rerun', authRequired, asyncHandler(async (request, response) => {
  const AnalysisRecord = await getAnalysisRecordModel();
  const user = request.user;
  const taskId = String(request.params.taskId || '').trim();

  if (!taskId) {
    response.status(400).json({ error: 'Task ID is required.' });
    return;
  }

  const item = await AnalysisRecord.findOne({
    $and: [
      { taskId },
      buildOwnedAnalysisQuery(user),
    ],
  });

  if (!item) {
    response.status(404).json({ error: 'Analysis record not found.' });
    return;
  }

  if (String(item.status || '').toLowerCase() !== 'failed') {
    response.status(400).json({ error: 'Only failed scans can be rerun.' });
    return;
  }

  item.status = 'queued';
  item.emailStatus = 'pending';
  item.emailError = undefined;
  item.failureReason = undefined;
  item.attachmentCount = 0;
  item.reportFiles = [];
  item.reportStorage = undefined;
  item.score = undefined;
  item.scoreCard = undefined;
  item.aiReport = undefined;
  item.autoRecoveryAttempts = 0;
  item.lastAutoRecoveryAt = undefined;
  await item.save();

  const { fullAuditQueue } = getAuditQueues();
  await fullAuditQueue.addJob({
    email: item.email,
    url: item.url,
    userId: item.user || undefined,
    taskId: item.taskId,
    planId: item.planId,
    selectedDevice: item.device,
    firstName: item.firstName || '',
    lastName: item.lastName || '',
  });

  response.json({
    message: 'Failed full audit has been queued again.',
    taskId: item.taskId,
  });
}));

router.post('/my-analysis/:taskId/rescan', authRequired, asyncHandler(async (request, response) => {
  const AnalysisRecord = await getAnalysisRecordModel();
  const user = request.user;
  const taskId = String(request.params.taskId || '').trim();

  if (!taskId) {
    response.status(400).json({ error: 'Task ID is required.' });
    return;
  }

  const item = await AnalysisRecord.findOne({
    $and: [
      { taskId },
      buildOwnedAnalysisQuery(user),
    ],
  });

  if (!item) {
    response.status(404).json({ error: 'Analysis record not found.' });
    return;
  }

  const newTaskId = createTaskId();
  const clonedRecord = await AnalysisRecord.create({
    user: item.user || undefined,
    email: item.email,
    firstName: item.firstName || '',
    lastName: item.lastName || '',
    url: item.url,
    taskId: newTaskId,
    planId: item.planId || null,
    device: item.device || null,
    status: 'queued',
    emailStatus: 'pending',
  });

  const { fullAuditQueue } = getAuditQueues();
  await fullAuditQueue.addJob({
    email: item.email,
    url: item.url,
    userId: item.user || undefined,
    taskId: newTaskId,
    planId: item.planId,
    selectedDevice: item.device,
    firstName: item.firstName || '',
    lastName: item.lastName || '',
    recordId: clonedRecord._id,
  });

  response.json({
    message: 'A new full audit scan has been queued.',
    taskId: newTaskId,
  });
}));

router.delete('/my-analysis/:taskId', authRequired, asyncHandler(async (request, response) => {
  const AnalysisRecord = await getAnalysisRecordModel();
  const user = request.user;
  const taskId = String(request.params.taskId || '').trim();

  if (!taskId) {
    response.status(400).json({ error: 'Task ID is required.' });
    return;
  }

  const item = await AnalysisRecord.findOne({
    $and: [
      { taskId },
      buildOwnedAnalysisQuery(user),
    ],
  });

  if (!item) {
    response.status(404).json({ error: 'Analysis record not found.' });
    return;
  }

  if (isActiveScanStatus(item.status)) {
    response.status(400).json({ error: 'Active full audits cannot be deleted while they are still running.' });
    return;
  }

  await AnalysisRecord.deleteOne({ _id: item._id });

  response.json({
    message: 'Full audit deleted.',
    taskId,
  });
}));

router.post('/my-quick-scans/:quickScanId/rerun', authRequired, asyncHandler(async (request, response) => {
  const QuickScan = await getQuickScanModel();
  const user = request.user;
  const quickScanId = String(request.params.quickScanId || '').trim();

  if (!quickScanId || !isValidObjectId(quickScanId)) {
    response.status(400).json({ error: 'Quick scan ID is required.' });
    return;
  }

  const item = await QuickScan.findOne({
    $and: [
      { _id: quickScanId },
      buildOwnedQuickScanQuery(user),
    ],
  });

  if (!item) {
    response.status(404).json({ error: 'Quick scan not found.' });
    return;
  }

  if (String(item.status || '').toLowerCase() !== 'failed') {
    response.status(400).json({ error: 'Only failed scans can be rerun.' });
    return;
  }

  item.status = 'queued';
  item.errorMessage = undefined;
  item.emailStatus = 'pending';
  item.emailError = undefined;
  item.scanScore = undefined;
  item.scoreCard = undefined;
  item.aiReport = undefined;
  item.reportGenerated = false;
  item.reportPath = null;
  item.reportDirectory = undefined;
  item.reportStorage = undefined;
  item.reportFiles = [];
  item.scanDate = new Date();
  item.autoRecoveryAttempts = 0;
  item.lastAutoRecoveryAt = undefined;
  await item.save();

  const { quickScanQueue } = getAuditQueues();
  const taskId = createTaskId();
  await quickScanQueue.addJob({
    email: item.email,
    url: item.url,
    firstName: item.firstName || '',
    lastName: item.lastName || '',
    userId: null,
    taskId,
    jobType: 'quick-scan',
    subscriptionId: null,
    priority: 2,
    quickScanId: item._id,
    selectedDevice: item.device || 'desktop',
  });

  response.json({
    message: 'Failed quick scan has been queued again.',
    quickScanId: String(item._id || quickScanId),
  });
}));

router.post('/my-quick-scans/:quickScanId/rescan', authRequired, asyncHandler(async (request, response) => {
  const QuickScan = await getQuickScanModel();
  const user = request.user;
  const quickScanId = String(request.params.quickScanId || '').trim();

  if (!quickScanId || !isValidObjectId(quickScanId)) {
    response.status(400).json({ error: 'Quick scan ID is required.' });
    return;
  }

  const item = await QuickScan.findOne({
    $and: [
      { _id: quickScanId },
      buildOwnedQuickScanQuery(user),
    ],
  });

  if (!item) {
    response.status(404).json({ error: 'Quick scan not found.' });
    return;
  }

  const clonedRecord = await QuickScan.create({
    url: item.url,
    email: item.email,
    firstName: item.firstName || '',
    lastName: item.lastName || '',
    device: item.device || 'desktop',
    status: 'queued',
    emailStatus: 'pending',
    scanDate: new Date(),
  });

  const { quickScanQueue } = getAuditQueues();
  const taskId = createTaskId();
  await quickScanQueue.addJob({
    email: item.email,
    url: item.url,
    firstName: item.firstName || '',
    lastName: item.lastName || '',
    userId: null,
    taskId,
    jobType: 'quick-scan',
    subscriptionId: null,
    priority: 2,
    quickScanId: clonedRecord._id,
    selectedDevice: item.device || 'desktop',
  });

  response.json({
    message: 'A new quick scan has been queued.',
    quickScanId: String(clonedRecord._id || ''),
  });
}));

router.delete('/my-quick-scans/:quickScanId', authRequired, asyncHandler(async (request, response) => {
  const QuickScan = await getQuickScanModel();
  const user = request.user;
  const quickScanId = String(request.params.quickScanId || '').trim();

  if (!quickScanId || !isValidObjectId(quickScanId)) {
    response.status(400).json({ error: 'Quick scan ID is required.' });
    return;
  }

  const item = await QuickScan.findOne({
    $and: [
      { _id: quickScanId },
      buildOwnedQuickScanQuery(user),
    ],
  });

  if (!item) {
    response.status(404).json({ error: 'Quick scan not found.' });
    return;
  }

  if (isActiveScanStatus(item.status)) {
    response.status(400).json({ error: 'Active quick scans cannot be deleted while they are still running.' });
    return;
  }

  await QuickScan.deleteOne({ _id: item._id });

  response.json({
    message: 'Quick scan deleted.',
    quickScanId,
  });
}));

router.get('/my-quick-scans/:quickScanId', authRequired, asyncHandler(async (request, response) => {
  const QuickScan = await getQuickScanModel();
  const user = request.user;
  const quickScanId = String(request.params.quickScanId || '').trim();

  if (!quickScanId || !isValidObjectId(quickScanId)) {
    response.status(400).json({ error: 'Quick scan ID is required.' });
    return;
  }

  const item = await QuickScan.findOne({
    $and: [
      { _id: quickScanId },
      buildOwnedQuickScanQuery(user),
    ],
  });

  if (!item) {
    response.status(404).json({ error: 'Quick scan not found.' });
    return;
  }

  await listAnalysisReportFiles(item);

  const attachmentCount = Array.isArray(item.reportFiles) && item.reportFiles.length > 0
    ? item.reportFiles.length
    : Number(item.reportStorage?.objectCount || 0);

  const detail = buildAnalysisDetail({
    _id: item._id,
    taskId: String(item._id || ''),
    email: item.email,
    firstName: item.firstName,
    lastName: item.lastName,
    device: item.device || 'desktop',
    url: item.url,
    score: item.scanScore ?? item.scoreCard?.overallScore,
    scoreCard: item.scoreCard,
    aiReport: undefined,
    status: item.status,
    emailStatus: item.emailStatus || (item.status === 'completed' ? 'sent' : item.status === 'failed' ? 'failed' : 'pending'),
    attachmentCount,
    failureReason: item.errorMessage || undefined,
    emailError: item.emailError || undefined,
    reportDirectory: item.reportDirectory || undefined,
    reportStorage: item.reportStorage,
    reportFiles: item.reportFiles,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  });

  const reportFiles = filterStoredQuickScanAiSummary(detail.reportFiles);

  response.json({
    item: {
      ...detail,
      reportFiles,
      attachmentCount: reportFiles.length,
      quickScanId,
      scanDate: item.scanDate instanceof Date ? item.scanDate.toISOString() : item.scanDate,
      reportGenerated: Boolean(item.reportGenerated),
    },
  });
}));

router.get('/my-quick-scans/:quickScanId/reports/:reportId', authRequired, asyncHandler(async (request, response) => {
  const QuickScan = await getQuickScanModel();
  const user = request.user;
  const quickScanId = String(request.params.quickScanId || '').trim();
  const reportId = String(request.params.reportId || '').trim();
  const disposition = request.query.disposition === 'inline' ? 'inline' : 'attachment';

  if (!quickScanId || !isValidObjectId(quickScanId) || !reportId) {
    response.status(400).json({ error: 'Quick scan ID and report ID are required.' });
    return;
  }

  const item = await QuickScan.findOne({
    $and: [
      { _id: quickScanId },
      buildOwnedQuickScanQuery(user),
    ],
  });

  if (!item) {
    response.status(404).json({ error: 'Quick scan not found.' });
    return;
  }

  await listAnalysisReportFiles(item);

  const sent = await sendAnalysisReportFile(item, reportId, response, disposition).catch((error) => {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return false;
    }

    throw error;
  });

  if (!sent && !response.headersSent) {
    response.status(404).json({ error: 'Report file not found.' });
  }
}));

router.get('/my-analysis/:taskId', authRequired, asyncHandler(async (request, response) => {
  const AnalysisRecord = await getAnalysisRecordModel();
  const user = request.user;
  const taskId = String(request.params.taskId || '').trim();

  if (!taskId) {
    response.status(400).json({ error: 'Task ID is required.' });
    return;
  }

  const item = await AnalysisRecord.findOne({
    $and: [
      { taskId },
      buildOwnedAnalysisQuery(user),
    ],
  });

  if (!item) {
    response.status(404).json({ error: 'Analysis record not found.' });
    return;
  }

  await listAnalysisReportFiles(item);
  response.json({ item: buildAnalysisDetail(item) });
}));

router.get('/my-analysis/:taskId/reports', authRequired, asyncHandler(async (request, response) => {
  const AnalysisRecord = await getAnalysisRecordModel();
  const user = request.user;
  const taskId = String(request.params.taskId || '').trim();

  if (!taskId) {
    response.status(400).json({ error: 'Task ID is required.' });
    return;
  }

  const item = await AnalysisRecord.findOne({
    $and: [
      { taskId },
      buildOwnedAnalysisQuery(user),
    ],
  });

  if (!item) {
    response.status(404).json({ error: 'Analysis record not found.' });
    return;
  }

  const files = await listAnalysisReportFiles(item);
  response.json({ files });
}));

router.get('/my-analysis/:taskId/reports/:reportId', authRequired, asyncHandler(async (request, response) => {
  const AnalysisRecord = await getAnalysisRecordModel();
  const user = request.user;
  const taskId = String(request.params.taskId || '').trim();
  const reportId = String(request.params.reportId || '').trim();
  const disposition = request.query.disposition === 'inline' ? 'inline' : 'attachment';

  if (!taskId || !reportId) {
    response.status(400).json({ error: 'Task ID and report ID are required.' });
    return;
  }

  const item = await AnalysisRecord.findOne({
    $and: [
      { taskId },
      buildOwnedAnalysisQuery(user),
    ],
  });

  if (!item) {
    response.status(404).json({ error: 'Analysis record not found.' });
    return;
  }

  const sent = await sendAnalysisReportFile(item, reportId, response, disposition).catch((error) => {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return false;
    }

    throw error;
  });

  if (!sent && !response.headersSent) {
    response.status(404).json({ error: 'Report file not found.' });
  }
}));

export default router;
