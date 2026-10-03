// CTA click tracking for /explore. Same guarded window.lintrk pattern as
// components/home/QuickScanSection.js's quick-scan conversion — window.lintrk
// is a queueing stub defined by the sitewide LinkedIn Insight Tag in
// app/layout.js, safe to call even before insight.min.js finishes loading.
// Centralized here (rather than repeated inline) because /explore has three
// CTAs needing the identical guard, not because a generic analytics
// abstraction is needed — see Milestone 3.0 Developer Plan, Module 8.
//
// conversion_id values are supplied by marketing per product; until then
// this is a no-op so unset ids never crash or fire a wrong/blank conversion.
const CONVERSION_IDS = {
  explore_ai_edge: undefined,
  explore_ai_readiness_assessment: undefined,
  explore_books: undefined,
};

export function trackExploreClick(analyticsId) {
  if (typeof window === 'undefined' || typeof window.lintrk !== 'function') return;
  const conversionId = CONVERSION_IDS[analyticsId];
  if (!conversionId) return;
  window.lintrk('track', { conversion_id: conversionId });
}
