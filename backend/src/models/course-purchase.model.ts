import mongoose from 'mongoose';

const courseSeatSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedAt: { type: Date, default: Date.now },
}, { _id: false });

const coursePurchaseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  // Milestone 3.1 Developer Plan, Architecture Decision 2.5: the source doc
  // asks to "preserve the ability to add team/company licenses later"
  // without building that UI now. ownerType/seats exist from day one so a
  // future org purchase doesn't need a schema migration — 3.1 only ever
  // writes ownerType: 'user' with a single implicit seat.
  ownerType: { type: String, enum: ['user', 'organization'], default: 'user' },
  seats: { type: [courseSeatSchema], default: [] },
  stripeSessionId: { type: String, index: true },
  amount: { type: Number },
  purchasedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Backs the dashboard's "which courses does this customer own" query
// (Milestone 3.1 Developer Plan, Module 3).
coursePurchaseSchema.index({ userId: 1, courseId: 1 });

const CoursePurchase = (mongoose.models.CoursePurchase as mongoose.Model<unknown> | undefined)
  || mongoose.model('CoursePurchase', coursePurchaseSchema);

export default CoursePurchase;
