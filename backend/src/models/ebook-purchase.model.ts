import mongoose from 'mongoose';

const ebookPurchaseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  ebookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ebook', required: true },
  stripeSessionId: { type: String, index: true },
  amount: { type: Number },
  purchasedAt: { type: Date, default: Date.now },
  // Milestone 3.1 client answers 2026-10-07, #9: "7 days seems reasonable."
  // Matches report-delivery.ts's existing default for audit report links.
  // A fresh signed URL is generated on each download request (Module 16);
  // this field is informational/audit only, not itself a live link.
  downloadTokenExpiresAt: { type: Date },
}, { timestamps: true });

// Backs the dashboard/library's "which ebooks does this customer own" query
// (Module 3, Module 16).
ebookPurchaseSchema.index({ userId: 1, ebookId: 1 });

const EbookPurchase = (mongoose.models.EbookPurchase as mongoose.Model<unknown> | undefined)
  || mongoose.model('EbookPurchase', ebookPurchaseSchema);

export default EbookPurchase;
