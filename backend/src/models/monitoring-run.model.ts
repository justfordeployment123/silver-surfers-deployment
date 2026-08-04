import mongoose from 'mongoose';

const monitoringRunSchema = new mongoose.Schema({
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'MonitoringJob', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // The spec names a single `auditId`, but the record it points to lives in
  // one of two different collections depending on `MonitoringJob.scanType`
  // (full audits persist to AnalysisRecord, quick scans to QuickScan) — this
  // codebase has no prior refPath usage, but it's the standard Mongoose way
  // to keep one field name while resolving against either collection.
  auditId: { type: mongoose.Schema.Types.ObjectId, refPath: 'auditModel' },
  auditModel: { type: String, enum: ['AnalysisRecord', 'QuickScan'] },
  // 2.2.7.4 — snapshot of the job's wcagStandard/conformanceLevel at the
  // moment this run was dispatched. The job's own fields can change between
  // runs (user edits it), so the run history needs its own copy to show
  // which standard was actually used for each historical run.
  wcagStandard: { type: String, enum: ['wcag21', 'wcag22', 'combined'] },
  conformanceLevel: { type: String, enum: ['A', 'AA', 'AAA'] },
  triggeredAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
  score: { type: Number },
  scoreDelta: { type: Number },
  status: { type: String, enum: ['pending', 'running', 'complete', 'failed'], default: 'pending', index: true },
  errorMessage: { type: String },
  issueCount: { type: Number },
  newIssueCount: { type: Number },
  resolvedIssueCount: { type: Number },
}, { timestamps: true });

// Backs "last N runs for this job" (job detail page, GET /jobs/:id/runs) and
// prevents-duplicate-enqueue checks in the schedule engine (2.2.6.2).
monitoringRunSchema.index({ jobId: 1, triggeredAt: -1 });

const MonitoringRun = (mongoose.models.MonitoringRun as mongoose.Model<unknown> | undefined)
  || mongoose.model('MonitoringRun', monitoringRunSchema);

export default MonitoringRun;
