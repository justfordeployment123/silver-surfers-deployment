import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  stripeSubscriptionId: { type: String, required: true, unique: true, index: true },
  stripeCustomerId: { type: String, required: true, index: true },
  status: {
    type: String,
    enum: ['active', 'canceled', 'past_due', 'unpaid', 'incomplete', 'trialing', 'paused'],
    required: true,
  },
  planId: {
    type: String,
    enum: ['starter', 'pro', 'custom'],
    required: true,
  },
  priceId: { type: String, required: true },
  billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'yearly' },
  currentPeriodStart: { type: Date, required: true },
  currentPeriodEnd: { type: Date, required: true },
  cancelAtPeriodEnd: { type: Boolean, default: false },
  canceledAt: { type: Date },
  trialStart: { type: Date },
  trialEnd: { type: Date },
  usage: {
    scansThisMonth: { type: Number, default: 0 },
    lastResetDate: { type: Date, default: Date.now },
    totalScans: { type: Number, default: 0 },
  },
  limits: {
    scansPerMonth: { type: Number, required: true },
    maxUsers: { type: Number, default: 1 },
    features: [{ type: String }],
  },
  teamMembers: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    email: { type: String, required: true },
    status: { type: String, enum: ['pending', 'active'], default: 'pending' },
    addedAt: { type: Date, default: Date.now },
    acceptedAt: { type: Date },
    invitationToken: { type: String },
  }],
  metadata: {
    createdBy: { type: String },
    notes: { type: String },
  },
}, { timestamps: true });

subscriptionSchema.index({ user: 1, status: 1 });
subscriptionSchema.index({ currentPeriodEnd: 1 });

const Subscription = (mongoose.models.Subscription as mongoose.Model<unknown> | undefined)
  || mongoose.model('Subscription', subscriptionSchema);

export default Subscription;
