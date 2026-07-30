import mongoose from 'mongoose';

const notificationLogSchema = new mongoose.Schema({
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'MonitoringJob', required: true, index: true },
  runId: { type: mongoose.Schema.Types.ObjectId, ref: 'MonitoringRun', index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['run_complete', 'score_drop', 'new_issues'], required: true },
  recipients: [{ type: String, trim: true }],
  subject: { type: String, required: true },
  status: { type: String, enum: ['sent', 'failed'], required: true },
  errorMessage: { type: String },
  messageId: { type: String },
  sentAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Backs the admin audit trail and a future user notification inbox —
// "all notifications for this job/run, newest first".
notificationLogSchema.index({ jobId: 1, createdAt: -1 });
notificationLogSchema.index({ userId: 1, createdAt: -1 });

const NotificationLog = (mongoose.models.NotificationLog as mongoose.Model<unknown> | undefined)
  || mongoose.model('NotificationLog', notificationLogSchema);

export default NotificationLog;
