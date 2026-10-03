/**
 * Product catalog for /explore (Milestone 3.0).
 *
 * Single source of truth for the Explore page's product cards. Consumers
 * (ExploreProductGrid) must map over the whole array rather than indexing
 * specific entries, so a 4th/5th product can be added here later without
 * touching any component.
 *
 * @typedef {object} ExploreProductCta
 * @property {string} label
 * @property {string} href
 * @property {boolean} external - opens in a new tab when true
 * @property {string} analyticsId - key into lib/analytics/trackExploreClick.js
 *
 * @typedef {object} ExploreProduct
 * @property {string} id - stable slug, used as the React key
 * @property {string} category
 * @property {string} name
 * @property {string} tagline - may be '' (omit rendering, don't fabricate one)
 * @property {string} description
 * @property {string[]} benefits
 * @property {string} image
 * @property {string} imageAlt
 * @property {ExploreProductCta} cta
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
  {
    id: 'books',
    category: 'Books',
    name: 'Ideas for Work, Life & What Comes Next',
    tagline: '',
    description:
      "Explore thought-provoking books on leadership, longevity, personal growth, and navigating life's next chapter.",
    benefits: [
      'Practical insights',
      'Real-world perspectives',
      'Available in print and digital formats',
    ],
    image: '/explore/books.png',
    imageAlt: "Stack of SilverSurfers.ai books including The Longevity Gap and The Caregiver's Crossroads",
    cta: {
      label: 'Explore the Books',
      href: 'https://clear-course-compass.base44.app/shop',
      external: true,
      analyticsId: 'explore_books',
    },
  },
];

export default exploreProducts;
