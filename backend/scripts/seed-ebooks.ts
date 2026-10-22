// Legacy catalog safeguard. The current client decision is that every print
// and digital book purchase is handled by Base44, not native Stripe/S3.
// Running this script keeps the known titles inactive. Do not activate them
// unless a future, separately approved milestone restores native ebooks.
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

  console.log('\nAll 8 legacy titles are inactive. Current book sales remain external through Base44.');

  await disconnectDatabase();
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
