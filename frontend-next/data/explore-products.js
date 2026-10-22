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
 * @property {string} [href] - external destination; omit when productKey is set
 * @property {boolean} [external] - opens in a new tab when true
 * @property {string} [productKey] - Milestone 3.1: triggers native Stripe
 *   checkout via ExploreProductCard instead of plain navigation (see
 *   backend/src/features/billing/product-catalog.ts for valid keys)
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
export const BOOK_STORE_URL = 'https://clear-course-compass.base44.app/';

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
    image: '/explore/ai-edge.svg',
    imageAlt: 'AI Edge training preview shown on a laptop screen',
    cta: {
      label: 'Purchase AI Edge',
      // Milestone 3.1 native checkout. AI_EDGE_PRICE_ID is configured per
      // environment and the webhook grants course access after payment.
      productKey: 'ai-edge-course',
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
    image: '/explore/ai-readiness-assessment.svg',
    imageAlt: 'AI Readiness Assessment results shown on a tablet screen',
    cta: {
      label: 'Purchase Assessment',
      // Milestone 3.1 native checkout. After payment, the assessment is
      // added to the customer dashboard and can be started immediately.
      productKey: 'ai-readiness-assessment',
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
    image: '/explore/books.svg',
    imageAlt: "Stack of SilverSurfers.ai books including The Longevity Gap and The Caregiver's Crossroads",
    cta: {
      label: 'Explore the Books',
      // Final current sales path: all print and digital book purchases are
      // handled by Base44. SilverSurfers.ai does not host or fulfil ebooks.
      href: BOOK_STORE_URL,
      external: true,
      analyticsId: 'explore_books',
    },
  },
];

export default exploreProducts;
