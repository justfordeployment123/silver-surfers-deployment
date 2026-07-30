import mongoose from 'mongoose';

const monitoringJobSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  domain: { type: String, required: true, trim: true },
  schedule: {
    type: String,
    enum: ['weekly', 'biweekly', 'monthly', 'trimonthly', 'quarterly', 'custom'],
    required: true,
  },
  customCronExpression: { type: String },
  scanType: { type: String, enum: ['quick', 'full'], required: true },
  wcagStandard: {
    type: String,
    enum: ['wcag21', 'wcag22', 'combined'],
    default: 'combined',
  },
  conformanceLevel: { type: String, enum: ['A', 'AA', 'AAA'], default: 'AA' },
  devicesEnabled: [{ type: String, enum: ['desktop', 'tablet', 'mobile'] }],
  maxPages: { type: Number, default: 25 },
  status: { type: String, enum: ['active', 'paused', 'error'], default: 'active', index: true },
  nextRunAt: { type: Date, index: true },
  lastRunAt: { type: Date },
  lastRunScore: { type: Number },
  alertThreshold: { type: Number },
  alertEmails: [{ type: String, trim: true }],
  // Per-job notification toggles referenced by 2.2.6.4/2.2.6.6 (the "notify
  // on every run / notify only on issues" UI) but not listed in 2.2.6.1's
  // field list — added here since alerting can't be implemented without them.
  notifyOnComplete: { type: Boolean, default: true },
  notifyOnNewIssues: { type: Boolean, default: true },
}, { timestamps: true });

// Backs the schedule engine's core query (2.2.6.2): jobs due to run, active only.
monitoringJobSchema.index({ status: 1, nextRunAt: 1 });

const MonitoringJob = (mongoose.models.MonitoringJob as mongoose.Model<unknown> | undefined)
  || mongoose.model('MonitoringJob', monitoringJobSchema);

export default MonitoringJob;
