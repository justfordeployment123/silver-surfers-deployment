// Seeds the AI Edge Course doc (models/course.model.ts, Milestone 3.1
// Developer Plan Module 4) with the real content Jackie delivered
// ("Milestone 3.1 Learning Modules for AI Edge.docx", Docs/, 2026-10-09):
// 7 real module titles, descriptions, and YouTube video links. Safe to
// re-run — upserts by slug, so it can be run again if content changes.
//
// Usage: node --import ./scripts/register-typescript-loader.mjs scripts/seed-ai-edge-course.ts

import { connectDatabase, disconnectDatabase } from '../src/config/database.ts';
import { env } from '../src/config/env.ts';
import Course from '../src/models/course.model.ts';

interface ModuleSeed {
  title: string;
  description: string;
  youtubeId: string;
}

const MODULES: ModuleSeed[] = [
  {
    title: 'The AI Landscape for SMBs',
    description: 'This module teaches you how to see AI agents as practical team members for your small or mid-size business. You will learn which agent is best for each common business task and why that choice matters. The goal is to remove confusion and give you a clear way to start using AI without big budgets or technical complexity. You will learn to match agent strengths to real work needs, a match that saves time, cuts costs, and improves output quality. This module also sets the foundation for integrating agents into daily workflows and scaling your AI use as your comfort grows.',
    youtubeId: '2y8vga_W9YE',
  },
  {
    title: 'Building for Business: Practical AI for Small Teams',
    description: 'This module teaches you how to turn AI into practical tools that solve real business problems today. You will learn which AI agents match specific business functions and how to use them without large budgets or technical teams. Small and mid-sized businesses need fast, low-cost wins. This module shows you how to automate customer support, manage social media, create content, run market research, and boost sales with AI agents you can deploy in days.',
    youtubeId: 'qKZ5eRc9M2M',
  },
  {
    title: 'AI Customer Management Framework',
    description: 'This module teaches you how to use AI agents to run customer support and boost sales for small and mid-sized businesses. You will learn which AI tools do which jobs, how to set up automated yet personal processes, and how to scale customer operations without hiring a large team. This work matters because many small businesses cannot afford big support teams. You will learn a clear, repeatable framework that lets AI handle routine work while you focus on real human connections. The result is faster responses, more sales, and better customer loyalty.',
    youtubeId: 'wBgbEd78TTk',
  },
  {
    title: 'Deeper Engagement with AI',
    description: 'This module teaches you how to use AI to strengthen relationships with your team and your customers. You will learn how AI can increase speed, personalize interactions, and free your people to focus on human work. This shift solves the common fear that AI will make interactions cold or replace people. Instead, you will see how AI makes human connection deeper and more effective. You will learn practical steps for choosing the right AI agent, adding it into current workflows, and measuring real impact.',
    youtubeId: 'wpc2lHqsH5E',
  },
  {
    title: 'Ease Into It & Integrate',
    description: 'This module teaches you how to move AI from theory into daily work. You will learn a stepwise plan to add AI tools without disrupting your current processes. The goal is fast wins that build trust and long-term change that scales. This module matters because many small and mid-size businesses try to do too much at once, causing confusion, wasted time, and stalled projects. You will learn how to pick high-impact, low-risk starts and expand steadily so your team accepts and uses AI confidently.',
    youtubeId: 'a_7sAwLJEAo',
  },
  {
    title: 'Fast & Furious: Momentum Building',
    description: "This module teaches you how to turn scattered AI experiments into ongoing business momentum. You will learn to link tools, set simple measures, and focus on the highest impact areas. Momentum, not perfect plans, creates real advantage for small and mid-sized businesses. You'll discover how to spot gaps, sequence AI agents, and move faster than larger competitors.",
    youtubeId: '_lrWLhIozEM',
  },
  {
    title: 'Gain AI Mastery: AI-First Mindset Transformation',
    description: "This module teaches you how to make an AI-first mindset the normal way your team works. You'll learn how to turn early AI wins into lasting habits. The focus is on real, sustainable change, not short bursts of enthusiasm. This module shows you how to remove barriers, build momentum, and make AI part of everyday decisions so your business becomes faster and smarter over time.",
    youtubeId: 'PJEgGBatOLM',
  },
];

function toModuleDoc(seed: ModuleSeed, index: number) {
  const moduleNumber = index + 1;
  return {
    moduleId: `module-${moduleNumber}`,
    title: `Module ${moduleNumber} — ${seed.title}`,
    order: moduleNumber,
    lessons: [
      {
        lessonId: `module-${moduleNumber}-lesson-1`,
        title: seed.title,
        description: seed.description,
        youtubeId: seed.youtubeId,
        downloads: [],
        order: 1,
      },
    ],
  };
}

async function seed(): Promise<void> {
  await connectDatabase(env.mongoUri);

  const modules = MODULES.map(toModuleDoc);

  const course = await Course.findOneAndUpdate(
    { slug: 'ai-edge' },
    {
      slug: 'ai-edge',
      title: 'AI Edge',
      modules,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  console.log(`Seeded Course "ai-edge" (_id: ${course?._id}) with ${modules.length} real modules.`);

  await disconnectDatabase();
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
