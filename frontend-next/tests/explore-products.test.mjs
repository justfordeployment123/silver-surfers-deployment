import assert from 'node:assert/strict';
import test from 'node:test';

import exploreProducts from '../data/explore-products.js';

// The AI Readiness Assessment is sold through a GHL order form (client,
// 2026-11-24), like the trainings, instead of native Stripe checkout.
const assessment = exploreProducts.find((product) => product.id === 'ai-readiness-assessment');

test('the assessment card opens the GHL order form in the same tab', () => {
  assert.ok(assessment);
  assert.equal(assessment.cta.href, 'https://get.silversurfersinc.com/ai-readiness-assessment-checkout');
  assert.equal(assessment.cta.ghl, true);
  assert.equal(assessment.cta.productKey, undefined);
  assert.equal(assessment.cta.external, undefined);
});

test('the assessment keeps its analytics id and label', () => {
  assert.equal(assessment.cta.analyticsId, 'explore_ai_readiness_assessment');
  assert.ok(assessment.cta.label);
});

test('no other product card changed its checkout path', () => {
  const aiEdge = exploreProducts.find((product) => product.id === 'ai-edge');
  assert.equal(aiEdge.cta.productKey, 'ai-edge-course');
  assert.ok(exploreProducts.length >= 3);
});
