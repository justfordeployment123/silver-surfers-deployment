/**
 * Product catalog for /explore (Milestone 3.0).
 *
 * Single source of truth for the Explore page's product cards. Consumers
 * (ExploreProductGrid) must map over the whole array rather than indexing
 * specific entries, so a 4th/5th product can be added here later without
 * touching any component.
 */
const exploreProducts = [
  {
    id: 'ai-edge',
    category: 'Online Training',
    name: 'AI Edge',
    tagline: 'Helping Leaders Make Better Decisions in the AI Era.',
    description:
      'Practical, self-paced training that helps leaders understand AI, identify opportunities, and make smarter business decisions.',
    benefits: [
      '7 bite-sized modules',
      'Practical tools and templates',
      'Learn at your own pace',
    ],
    image: '/explore/ai-edge.png',
    imageAlt: 'AI Edge training preview shown on a laptop screen',
    cta: {
      label: 'Explore AI Edge',
      href: 'https://silversurfers.thrivecart.com/ai-edge-helping-leaders-make-better-decisions-in-the-ai-era/',
      external: true,
      analyticsId: 'explore_ai_edge',
    },
  },
  {
    id: 'ai-readiness-assessment',
    category: 'Assessment',
    name: 'AI Readiness Assessment',
    tagline: 'How Ready Is Your Business for AI?',
    description:
      "Get a clear picture of your organization's AI readiness and identify the areas that deserve your attention next.",
    benefits: [
      'Quick online assessment',
      'Personalized readiness results',
      'Actionable next steps',
    ],
    image: '/explore/ai-readiness-assessment.png',
    imageAlt: 'AI Readiness Assessment results shown on a tablet screen',
    cta: {
      label: 'Take the Assessment',
      // Placeholder until the client supplies the final calendar URL
      // (Milestone 3.0 Developer Plan, Module 9).
      href: process.env.NEXT_PUBLIC_EXPLORE_ASSESSMENT_CALENDAR_URL || '#',
      external: true,
      analyticsId: 'explore_ai_readiness_assessment',
    },
  },
];

export default exploreProducts;
