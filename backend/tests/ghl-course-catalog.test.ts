import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeCourseDetails, publicCourse } from '../src/features/courses/course-catalog.ts';

// Milestone 3.2 Developer Plan, Module 5: a course is sold either through
// native Stripe checkout or a GoHighLevel order form.
const lessons = [{ lessons: [{ youtubeId: 'dQw4w9WgXcQ' }] }];
const ghlCourse = (overrides: Record<string, unknown> = {}) => ({
  slug: 'ai-edge', description: 'Learn AI', status: 'published', modules: lessons,
  checkoutMethod: 'ghl', ghlCheckoutUrl: 'https://pay.example.com/ai-edge', displayPriceCents: 19700, ...overrides,
});

test('checkout method defaults to Stripe and keeps existing Stripe rules', () => {
  const details = normalizeCourseDetails({ slug: 'test', description: 'Learn', status: 'published', stripePriceId: 'price_abc', modules: lessons });
  assert.equal(details.checkoutMethod, 'stripe');
  assert.throws(() => normalizeCourseDetails({ slug: 'test', description: 'Learn', status: 'published', modules: lessons }), /Stripe Price ID/);
});

test('a published GHL course needs an order form URL and a display price, not a Stripe price', () => {
  const details = normalizeCourseDetails(ghlCourse());
  assert.equal(details.checkoutMethod, 'ghl');
  assert.equal(details.ghlCheckoutUrl, 'https://pay.example.com/ai-edge');
  assert.equal(details.displayPriceCents, 19700);
  assert.throws(() => normalizeCourseDetails(ghlCourse({ ghlCheckoutUrl: '' })), /order form URL/i);
  assert.throws(() => normalizeCourseDetails(ghlCourse({ displayPriceCents: null })), /display price/i);
  assert.throws(() => normalizeCourseDetails(ghlCourse({ displayPriceCents: 0 })), /display price/i);
});

test('a GHL draft can be saved before its order form exists', () => {
  const details = normalizeCourseDetails(ghlCourse({ status: 'draft', ghlCheckoutUrl: '', displayPriceCents: '' }));
  assert.equal(details.status, 'draft');
  assert.equal(details.ghlCheckoutUrl, '');
  assert.equal(details.displayPriceCents, null);
});

test('GHL links must be https URLs', () => {
  assert.throws(() => normalizeCourseDetails(ghlCourse({ ghlCheckoutUrl: 'http://pay.example.com' })), /https/);
  assert.throws(() => normalizeCourseDetails(ghlCourse({ ghlCheckoutUrl: 'javascript:alert(1)' })), /https/);
  assert.throws(() => normalizeCourseDetails(ghlCourse({ ghlWorkbookUrl: 'not a url' })), /https/);
  assert.equal(normalizeCourseDetails(ghlCourse({ ghlWorkbookUrl: ' https://pay.example.com/workbook ' })).ghlWorkbookUrl, 'https://pay.example.com/workbook');
});

test('display price must be a whole number of cents', () => {
  assert.throws(() => normalizeCourseDetails(ghlCourse({ displayPriceCents: 19.5 })), /display price/i);
  assert.throws(() => normalizeCourseDetails(ghlCourse({ displayPriceCents: -100 })), /display price/i);
  assert.equal(normalizeCourseDetails(ghlCourse({ displayPriceCents: '3700' })).displayPriceCents, 3700);
});

test('public GHL course data exposes the order form and display price', () => {
  const item = publicCourse({ _id: 'id', slug: 'ai-edge', title: 'AI Edge', description: 'Learn', checkoutMethod: 'ghl', ghlCheckoutUrl: 'https://pay.example.com/ai-edge', ghlWorkbookUrl: 'https://pay.example.com/wb', displayPriceCents: 19700, priceCents: 999, currency: 'eur', modules: lessons });
  assert.equal(item.checkoutMethod, 'ghl');
  assert.equal(item.checkoutUrl, 'https://pay.example.com/ai-edge');
  assert.equal(item.workbookUrl, 'https://pay.example.com/wb');
  assert.equal(item.priceCents, 19700);
  assert.equal(item.currency, 'usd');
});

test('public Stripe course data has no checkout URL and keeps the Stripe price', () => {
  const item = publicCourse({ _id: 'id', slug: 'x', title: 'X', priceCents: 3700, currency: 'usd', ghlCheckoutUrl: 'https://stale.example.com', modules: lessons });
  assert.equal(item.checkoutMethod, 'stripe');
  assert.equal(item.checkoutUrl, '');
  assert.equal(item.priceCents, 3700);
});
