import mongoose from 'mongoose';

// Milestone 3.2 Developer Plan, Module 1. A paid GHL order (or an admin
// grant) for an email that has no verified account yet. It is claimed when
// a user with that email verifies or logs in (Module 4), never attached to
// an unverified account.
const pendingCourseGrantSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  item: { type: String, enum: ['course', 'workbook'], required: true },
  source: { type: String, enum: ['ghl', 'admin'], default: 'ghl' },
  externalOrderId: { type: String, required: true },
  amountCents: { type: Number },
  // Kept for support/debugging. GHL never sends card data.
  rawPayload: { type: Object },
  claimedAt: { type: Date, default: null },
  claimedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

pendingCourseGrantSchema.index({ externalOrderId: 1 }, { unique: true });

const PendingCourseGrant = (mongoose.models.PendingCourseGrant as mongoose.Model<unknown> | undefined)
  || mongoose.model('PendingCourseGrant', pendingCourseGrantSchema);

export default PendingCourseGrant;
