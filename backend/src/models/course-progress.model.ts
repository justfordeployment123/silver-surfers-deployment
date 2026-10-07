import mongoose from 'mongoose';

const moduleProgressSchema = new mongoose.Schema({
  moduleId: { type: String, required: true },
  completedLessonIds: { type: [String], default: [] },
  // What "Continue Course" resumes to — Milestone 3.1 Developer Plan,
  // Module 6, decided per milestone_3_dev_team_answers.md #1 (track at
  // module level and exact-lesson level, not just module level).
  lastLessonId: { type: String },
  completedAt: { type: Date, default: null },
}, { _id: false });

// Separate from CoursePurchase — mirrors the monitoring-job/monitoring-run
// split (Architecture Decision 2.1): the purchase record rarely changes,
// progress changes on every lesson, so splitting them keeps the
// frequently-written doc small.
const courseProgressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  moduleProgress: { type: [moduleProgressSchema], default: [] },
}, { timestamps: true });

// Backs "load this customer's progress for this course" (course player,
// Module 6) and the dashboard's per-course status lookup (Module 3).
courseProgressSchema.index({ userId: 1, courseId: 1 }, { unique: true });

const CourseProgress = (mongoose.models.CourseProgress as mongoose.Model<unknown> | undefined)
  || mongoose.model('CourseProgress', courseProgressSchema);

export default CourseProgress;
