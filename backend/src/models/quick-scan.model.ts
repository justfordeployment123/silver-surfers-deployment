import mongoose from 'mongoose';

import { aiReportSchema, emailTrackingSchema, reportFileSchema, reportStorageSchema, scoreCardSchema } from './shared-schemas.ts';

const quickScanSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  firstName: {
    type: String,
    default: '',
  },
  lastName: {
    type: String,
    default: '',
  },
  device: {
    type: String,
    enum: ['desktop', 'mobile', 'tablet'],
    default: 'desktop',
  },
  scanScore: {
    type: Number,
    min: 0,
    max: 100,
    default: null,
  },
  scoreCard: {
    type: scoreCardSchema,
    default: undefined,
  },
  scanDate: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ['queued', 'processing', 'completed', 'failed'],
    default: 'queued',
  },
  emailStatus: {
    type: String,
    enum: ['pending', 'sending', 'sent', 'failed'],
    default: 'pending',
  },
  emailError: {
    type: String,
    default: null,
  },
  scannerJobId: {
    type: String,
    default: null,
  },
  scannerQueueStatus: {
    type: String,
    enum: ['pending', 'queued', 'completed', 'failed'],
    default: 'pending',
  },
  scannerResultAt: {
    type: Date,
    default: undefined,
  },
  scannerErrorCode: {
    type: String,
    default: null,
  },
  scannerArtifact: {
    type: mongoose.Schema.Types.Mixed,
    default: undefined,
  },
  reportGenerated: {
    type: Boolean,
    default: false,
  },
  reportPath: {
    type: String,
    default: null,
  },
  reportDirectory: {
    type: String,
    default: null,
  },
  aiReport: {
    type: aiReportSchema,
    default: undefined,
  },
  reportStorage: {
    type: reportStorageSchema,
    default: undefined,
  },
  reportFiles: {
    type: [reportFileSchema],
    default: [],
  },
  emailTracking: {
    type: emailTrackingSchema,
    default: undefined,
  },
  errorMessage: {
    type: String,
    default: null,
  },
  autoRecoveryAttempts: {
    type: Number,
    default: 0,
  },
  lastAutoRecoveryAt: {
    type: Date,
    default: undefined,
  },
}, {
  timestamps: true,
});

quickScanSchema.index({ email: 1, scanDate: -1 });
quickScanSchema.index({ url: 1 });
quickScanSchema.index({ scanDate: -1 });
quickScanSchema.index({ scannerJobId: 1 }, { sparse: true });
quickScanSchema.index({ 'reportStorage.objects.downloadTokenHash': 1 }, { sparse: true });
quickScanSchema.index({ 'emailTracking.trackingId': 1 }, { sparse: true });

const QuickScan = (mongoose.models.QuickScan as mongoose.Model<unknown> | undefined)
  || mongoose.model('QuickScan', quickScanSchema);

export default QuickScan;
