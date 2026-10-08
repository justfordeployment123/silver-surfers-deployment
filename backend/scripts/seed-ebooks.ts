// Seeds the Ebook catalog (models/ebook.model.ts, Milestone 3.1 Developer
// Plan Module 15) with the 8 real, already-approved "Decision Compass
// Series" titles by Valentina Teekapa — read directly off the cover art
// already live on the Explore page (frontend-next/public/explore/books.svg),
// not guessed. Client answers 2026-10-08, #8: every title gets sold as a
// PDF (digital), so all 8 are seeded.
//
// Seeded with active: false and a placeholder s3Key — the checkout flow
// (product-checkout.controller.ts's resolveEbookProduct) only matches
// { active: true }, so these are NOT purchasable yet. Before flipping a
// title to active:
//   1. Upload the real PDF to S3 and set its real s3Key.
//   2. Create a Stripe price for it and set stripePriceId.
//   3. Set active: true (and re-run this script, or update the doc directly).
//
// Usage: node --import ./scripts/register-typescript-loader.mjs scripts/seed-ebooks.ts

import { connectDatabase, disconnectDatabase } from '../src/config/database.ts';
import { env } from '../src/config/env.ts';
import Ebook from '../src/models/ebook.model.ts';

const TITLES = [
  'The Longevity Gap',
  "The Caregiver's Crossroads",
  "The Entrepreneur's Conundrum",
  "The Investor's Dilemma",
  "The Nurse's Choice",
  'Retire or Rewire',
  'Navigate & Elevate',
  'The Sandwich Generation',
];

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function seed(): Promise<void> {
  await connectDatabase(env.mongoUri);

  for (const title of TITLES) {
    const slug = slugify(title);
    const ebook = await Ebook.findOneAndUpdate(
      { slug },
      {
        slug,
        title,
        author: 'Valentina Teekapa',
        s3Key: `pending/${slug}.pdf`,
        format: 'pdf',
        active: false,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    console.log(`Seeded Ebook "${title}" (_id: ${ebook?._id}, active: false, placeholder s3Key)`);
  }

  console.log('\nAll 8 titles seeded as inactive placeholders. Before going live on any title: upload the real PDF to S3, set its s3Key, set a real stripePriceId, then set active: true.');

  await disconnectDatabase();
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
