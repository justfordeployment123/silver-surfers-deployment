import mongoose from 'mongoose';

// Catalog entry, not a purchase record — one document per sellable digital
// title. Static-seeded for 3.1 (admin-managed editing is a later concern,
// same reasoning as data/explore-products.js starting as a static file on
// the frontend before any catalog UI existed).
//
// Milestone 3.1 client answers 2026-10-07, #7/#8: PDF only, no EPUB, no
// in-site reader — direct download after purchase. Which specific titles
// get a digital edition (vs. staying physical-only via Base44) is still
// pending Ulya Khan's input (see Docs/Milestone_3.1_Developer_Plan.md,
// Module 15) — this model doesn't need that answer to exist, only the
// seed data does.
const ebookSchema = new mongoose.Schema({
  slug: {
    type: String, required: true, unique: true, trim: true, lowercase: true,
  },
  title: { type: String, required: true, trim: true },
  author: { type: String, trim: true },
  coverImage: { type: String },
  // S3 object key for the actual PDF file (Module 16 reuses
  // features/storage/report-storage.ts's signed-URL helper to serve this,
  // never a permanent public URL).
  s3Key: { type: String, required: true },
  format: { type: String, enum: ['pdf'], default: 'pdf' },
  stripePriceId: { type: String },
  active: { type: Boolean, default: true },
}, { timestamps: true });

const Ebook = (mongoose.models.Ebook as mongoose.Model<unknown> | undefined)
  || mongoose.model('Ebook', ebookSchema);

export default Ebook;
