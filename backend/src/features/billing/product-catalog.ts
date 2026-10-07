// Parallel to subscription-plans.ts, not merged into it (Architecture
// Decision 2.2, Milestone 3.1 Developer Plan): subscription-plans.ts is
// already plan/cycle-specific (monthlyPriceId/yearlyPriceId,
// limits.scansPerMonth) and shouldn't be bent to also describe one-time
// product purchases. This catalog describes the three 3.1 product types
// instead, dispatched by productType rather than plan id.

export type ProductType = 'course' | 'assessment' | 'ebook';

export interface ProductCatalogEntry {
  productKey: string;
  productType: ProductType;
  name: string;
  description?: string;
  stripePriceId?: string;
  // 'course' entries point at a Course doc's slug (models/course.model.ts,
  // Module 4), not a hardcoded ObjectId — the real _id only exists once the
  // seed script runs, so it's resolved via Course.findOne({ slug }) at
  // checkout/webhook time instead.
  courseSlug?: string;
}

// Client answers 2026-10-07, #2: AI Edge is a one-time purchase for 3.1
// ("down the road it may be bundled into something else" — that's a future
// catalog/business-logic change, not a reason to change this shape now).
export const PRODUCT_CATALOG: Record<string, ProductCatalogEntry> = {
  'ai-edge-course': {
    productKey: 'ai-edge-course',
    productType: 'course',
    name: 'AI Edge',
    description: 'Helping Leaders Make Better Decisions in the AI Era',
    stripePriceId: process.env.AI_EDGE_PRICE_ID,
    courseSlug: 'ai-edge',
  },
  'ai-readiness-assessment': {
    productKey: 'ai-readiness-assessment',
    productType: 'assessment',
    name: 'AI Readiness Assessment',
    stripePriceId: process.env.ASSESSMENT_PRICE_ID,
  },
  // Ebook entries are intentionally not listed here — Module 15 seeds them
  // into the Ebook collection (one doc per title) and the checkout
  // controller resolves an 'ebook:<slug>' productKey against that
  // collection directly, the same way this catalog resolves a course's
  // courseSlug. No static entry needed per title.
};

export function getProductByKey(productKey: string | null | undefined): ProductCatalogEntry | null {
  if (!productKey) {
    return null;
  }

  return PRODUCT_CATALOG[productKey] || null;
}
