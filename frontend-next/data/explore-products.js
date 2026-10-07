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
      label: 'Explore AI Edge',
      // Milestone 3.1 Module 7 (ThriveCart cutover): the native checkout
      // mechanism is built (ExploreProductCard supports cta.productKey →
      // Stripe redirect via /billing/create-product-checkout-session) and
      // the one migration risk the plan originally flagged is resolved
      // (client answers 2026-10-07, #3: no existing ThriveCart customers
      // to backfill). NOT flipped yet on purpose: there is no Stripe
      // price configured for 'ai-edge-course' yet (AI_EDGE_PRICE_ID env
      // var is unset), and the plan's own Module 7 explicitly says this
      // cutover happens last, after a real purchase is tested end-to-end
      // in staging — flipping this link now would replace a working
      // ThriveCart purchase path with a guaranteed-broken one. Once a
      // Stripe price exists and one real purchase has been verified,
      // flip this to: cta: { label: 'Explore AI Edge', productKey:
      // 'ai-edge-course', analyticsId: 'explore_ai_edge' } (external/href
      // both drop out — see ExploreProductCard.js).
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
    image: '/explore/ai-readiness-assessment.svg',
    imageAlt: 'AI Readiness Assessment results shown on a tablet screen',
    cta: {
      label: 'Take the Assessment',
      // Reuses the same GoHighLevel booking calendar already wired into
      // contact/page.js (GHL_BOOKING_URL) and Footer.js's "Consulting"
      // link, per explicit decision rather than a dedicated assessment-only
      // calendar. This is a 3.0-only stopgap: the source doc's Milestone
      // Boundary Summary has 3.1 replacing this with an AI agent intake
      // flow, not a plain booking link.
      href: 'https://api.leadconnectorhq.com/widget/bookings/jackie-gross-personal-calendar-qwh_05xzk',
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
    image: '/explore/books.svg',
    imageAlt: "Stack of SilverSurfers.ai books including The Longevity Gap and The Caregiver's Crossroads",
    cta: {
      label: 'Explore the Books',
      // Old clear-course-compass.base44.app domain 404'd ("app not found") —
      // client confirmed the shop moved to decision-compass-series.base44.app
      // (2026-10-07). The base app URL without /shop also works per the
      // client, but /shop is the direct listing page, matching this CTA's intent.
      href: 'https://decision-compass-series.base44.app/shop',
      external: true,
      analyticsId: 'explore_books',
    },
  },
];

export default exploreProducts;
