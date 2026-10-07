// Seeds the AI Edge Course doc (models/course.model.ts, Milestone 3.1
// Developer Plan Module 4). Safe to re-run — upserts by slug, so it can be
// run again once Jackie supplies the real module/lesson titles and YouTube
// IDs (client answers 2026-10-07, #4) without creating a duplicate Course.
//
// The 7 modules below are PLACEHOLDER titles/descriptions only — the
// Explore page copy already commits to "7 bite-sized modules"
// (frontend-next/data/explore-products.js), so the count is real, but no
// lesson content exists yet. Do not treat this as real copy; replace the
// placeholder fields once Jackie's content arrives, then re-run this
// script.
//
// Usage: node --import ./scripts/register-typescript-loader.mjs scripts/seed-ai-edge-course.ts

import { connectDatabase, disconnectDatabase } from '../src/config/database.ts';
import { env } from '../src/config/env.ts';
import Course from '../src/models/course.model.ts';

function placeholderModule(index: number) {
  const moduleNumber = index + 1;
  return {
    moduleId: `module-${moduleNumber}`,
    title: `Module ${moduleNumber} — Pending content from Jackie`,
    order: moduleNumber,
    lessons: [
      {
        lessonId: `module-${moduleNumber}-lesson-1`,
        title: 'Lesson title pending',
        description: 'Placeholder — real lesson title, description, and YouTube video ID pending delivery from Jackie (client answers 2026-10-07, #4). Replace before this course goes live.',
        youtubeId: '',
        downloads: [],
        order: 1,
      },
    ],
  };
}

async function seed(): Promise<void> {
  await connectDatabase(env.mongoUri);

  const modules = Array.from({ length: 7 }, (_, index) => placeholderModule(index));

  const course = await Course.findOneAndUpdate(
    { slug: 'ai-edge' },
    {
      slug: 'ai-edge',
      title: 'AI Edge',
      modules,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  console.log(`Seeded Course "ai-edge" (_id: ${course?._id}) with ${modules.length} placeholder modules.`);
  console.log('Reminder: lesson content is placeholder-only — re-run this script once Jackie supplies real content.');

  await disconnectDatabase();
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
