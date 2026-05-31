import mongoose from 'mongoose';

import { aiReportSchema, reportFileSchema, reportStorageSchema, scoreCardSchema } from './shared-schemas.ts';

const fullAuditTargetSchema = new mongoose.Schema({
  url: { type: String, required: true },
  device: { type: String, enum: ['desktop', 'mobile', 'tablet'], required: true },
  isHomepage: { type: Boolean, default: false },
  scanModeUsed: { type: String, enum: ['full', 'lite'], default: 'full' },
  status: { type: String, enum: ['completed', 'failed'], default: 'completed' },
  score: { type: Number, default: null },
  failureReason: { type: String, default: undefined },
  errorCode: { type: String, default: undefined },
  statusCode: { type: Number, default: undefined },
}, { _id: false });

const analysisRecordSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: false },
  email: { type: String, index: true },
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  url: { type: String, required: true },
  taskId: { type: String, index: true },
  stripeSessionId: { type: String, index: true },
  planId: { type: String, default: null },
  device: { type: String, default: null },
  score: { type: Number, default: null },
  scoreCard: { type: scoreCardSchema, default: undefined },
  aiReport: { type: aiReportSchema, default: undefined },
  status: { type: String, enum: ['queued', 'processing', 'completed', 'completed_with_warnings', 'failed'], default: 'queued' },
  emailStatus: { type: String, enum: ['pending', 'sending', 'sent', 'failed'], default: 'pending' },
  scannerJobId: { type: String, index: true, default: null },
  scannerQueueStatus: { type: String, default: null },
  scannerDispatchedAt: { type: Date, default: undefined },
  scannerResultAt: { type: Date, default: undefined },
  scannerArtifact: { type: mongoose.Schema.Types.Mixed, default: undefined },
  reportDirectory: { type: String },
  reportStorage: { type: reportStorageSchema, default: undefined },
  reportFiles: { type: [reportFileSchema], default: [] },
  warnings: { type: [String], default: [] },
  plannedTargetCount: { type: Number, default: 0 },
  successfulTargetCount: { type: Number, default: 0 },
  degradedTargetCount: { type: Number, default: 0 },
  failedTargetCount: { type: Number, default: 0 },
  scanTargets: { type: [fullAuditTargetSchema], default: [] },
  emailError: { type: String },
  emailAccepted: { type: [String], default: [] },
  emailRejected: { type: [String], default: [] },
  attachmentCount: { type: Number, default: 0 },
  failureReason: { type: String },
  autoRecoveryAttempts: { type: Number, default: 0 },
  lastAutoRecoveryAt: { type: Date, default: undefined },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

analysisRecordSchema.index({ email: 1, createdAt: -1 });
analysisRecordSchema.index({ user: 1, createdAt: -1 });
analysisRecordSchema.index({ 'reportStorage.objects.downloadTokenHash': 1 }, { sparse: true });

analysisRecordSchema.pre('save', function (next: (error?: Error) => void) {
  (this as { updatedAt?: Date }).updatedAt = new Date();
  next();
});

const AnalysisRecord = (mongoose.models.AnalysisRecord as mongoose.Model<unknown> | undefined)
  || mongoose.model('AnalysisRecord', analysisRecordSchema);

export default AnalysisRecord;
