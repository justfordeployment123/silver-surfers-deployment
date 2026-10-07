import mongoose from 'mongoose';

const assessmentAnswerSchema = new mongoose.Schema({
  questionId: { type: Number, required: true },
  text: { type: String, required: true },
  // True once the agent accepted this answer as clear; false if it hit the
  // clarification-loop cap (Module 10) and was accepted as-is without ever
  // being fully clarified — those get flagged for the admin reviewer below.
  clarified: { type: Boolean, default: true },
}, { _id: false });

const assessmentTranscriptEntrySchema = new mongoose.Schema({
  role: { type: String, enum: ['agent', 'customer'], required: true },
  text: { type: String, required: true },
  at: { type: Date, default: Date.now },
}, { _id: false });

// Same {status, provider}-tagged-union contract as ai-reporting.ts's
// existing AI report generation (Architecture Decision 2.3), so the admin
// review UI (Module 13) can treat this the same way reviewers already treat
// audit AI reports.
const assessmentAiReportSchema = new mongoose.Schema({
  status: { type: String, enum: ['pending', 'generated', 'fallback'], default: 'pending' },
  provider: { type: String, enum: ['anthropic', 'local'] },
  sections: { type: mongoose.Schema.Types.Mixed },
  generatedAt: { type: Date },
}, { _id: false });

const assessmentAdminReviewSchema = new mongoose.Schema({
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  decision: { type: String, enum: ['approved', 'rejected', null], default: null },
  notes: { type: String },
}, { _id: false });

const assessmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // Milestone 3.1 client answers 2026-10-07, #1: "keep the old results as
  // well... I like the idea of keeping all of them." Deliberately NOT a
  // unique index on userId — a customer may purchase/redo the assessment
  // more than once and every result is kept, not overwritten.
  status: {
    type: String,
    enum: [
      'purchased',
      'scheduled',
      'intake_in_progress',
      'intake_complete',
      'pending_review',
      'report_ready',
      'delivered',
    ],
    default: 'purchased',
    index: true,
  },
  // Which version of assessment-questions.ts's ASSESSMENT_QUESTIONS this
  // record was answered against (Module 9) — lets old and new reports stay
  // comparable even after the question wording changes later.
  questionnaireVersion: { type: Number, required: true },
  scheduledAt: { type: Date, default: null },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  answers: { type: [assessmentAnswerSchema], default: [] },
  transcript: { type: [assessmentTranscriptEntrySchema], default: [] },
  // Set when the clarification-loop cap (Module 10) is hit on any answer —
  // surfaced as a visual flag on the admin review screen (Module 13).
  needsAdminAttention: { type: Boolean, default: false },
  aiReport: { type: assessmentAiReportSchema, default: () => ({}) },
  adminReview: { type: assessmentAdminReviewSchema, default: () => ({}) },
  stripeSessionId: { type: String, index: true },
  amount: { type: Number },
}, { timestamps: true });

// Backs the dashboard's "all of this customer's assessments" query (Module 3)
// and the admin review queue's "pending_review first" listing (Module 13).
assessmentSchema.index({ userId: 1, createdAt: -1 });
assessmentSchema.index({ status: 1, createdAt: -1 });

const Assessment = (mongoose.models.Assessment as mongoose.Model<unknown> | undefined)
  || mongoose.model('Assessment', assessmentSchema);

export default Assessment;
