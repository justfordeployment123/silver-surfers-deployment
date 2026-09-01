import mongoose from 'mongoose';

// Lead-magnet submissions from /resources (see
// Docs/SilverSurfers_AI_Lead_Magnet_Recommendation.md and todo.md Phase C).
// Kept separate from ContactMessage: a lead has a resource/tag/GHL-sync
// lifecycle a contact-form message doesn't, and reusing that model would
// force unrelated fields onto both.
export type LeadGhlSyncStatus = 'stubbed' | 'sent' | 'failed';

export interface LeadDocument {
  _id?: string;
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
  requestedResource: string;
  tag: string;
  marketingConsent: boolean;
  ghlSyncStatus: LeadGhlSyncStatus;
  ghlSyncError?: string;
  createdAt?: Date;
  updatedAt?: Date;
  save(): Promise<unknown>;
}

const leadSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    company: { type: String, trim: true },
    // The resource's `slug` from data/resources.js (frontend-next) — not a
    // display title, so it stays stable if the title copy changes later.
    requestedResource: { type: String, required: true, trim: true },
    // The resource's GHL tag (e.g. "LM - Survey Report"), captured at
    // submission time rather than looked up again later, so a lead's record
    // still shows the correct tag even if data/resources.js changes after.
    tag: { type: String, required: true, trim: true },
    marketingConsent: { type: Boolean, default: false },
    // 'stubbed' until Phase F2 replaces the sync stub with the real GHL API
    // call; 'sent' / 'failed' once that's live. Never silently lost either
    // way — the Lead row exists regardless of sync outcome.
    ghlSyncStatus: { type: String, enum: ['stubbed', 'sent', 'failed'], default: 'stubbed' },
    ghlSyncError: { type: String },
  },
  { timestamps: true },
);

leadSchema.index({ createdAt: -1 });
leadSchema.index({ requestedResource: 1 });

const Lead = (mongoose.models.Lead as mongoose.Model<unknown> | undefined)
  || mongoose.model('Lead', leadSchema);

export default Lead;
