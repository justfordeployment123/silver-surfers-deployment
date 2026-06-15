import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  name: { type: String, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  provider: { type: String, enum: ['local', 'google'], default: 'local' },
  verified: { type: Boolean, default: true },
  accountStatus: { type: String, enum: ['active', 'suspended'], default: 'active' },
  suspendedAt: { type: Date },
  suspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  suspensionReason: { type: String, trim: true },
  verificationTokenHash: { type: String },
  verificationExpires: { type: Date },
  resetTokenHash: { type: String },
  resetExpires: { type: Date },
  googleId: { type: String },
  stripeCustomerId: { type: String, index: true },
  subscription: {
    stripeSubscriptionId: { type: String },
    status: {
      type: String,
      enum: ['active', 'canceled', 'past_due', 'unpaid', 'incomplete', 'incomplete_expired', 'trialing', 'paused', 'none'],
      default: 'none',
    },
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    planId: { type: String, enum: ['starter', 'pro', 'custom'], default: null },
    priceId: { type: String },
    usage: {
      scansThisMonth: { type: Number, default: 0 },
      lastResetDate: { type: Date, default: Date.now },
    },
    teamMembers: [{
      email: { type: String, required: true },
      status: { type: String, enum: ['pending', 'active'], default: 'pending' },
      invitedAt: { type: Date, default: Date.now },
      joinedAt: { type: Date },
    }],
    isTeamMember: { type: Boolean, default: false },
    teamOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  oneTimeScans: { type: Number, default: 0 },
  purchaseHistory: [{
    date: { type: Date, default: Date.now },
    planId: { type: String },
    planName: { type: String },
    amount: { type: Number },
    sessionId: { type: String },
    type: { type: String, enum: ['one-time', 'subscription'], default: 'one-time' },
  }],
}, { timestamps: true });

const User = (mongoose.models.User as mongoose.Model<unknown> | undefined)
  || mongoose.model('User', userSchema);

export default User;
