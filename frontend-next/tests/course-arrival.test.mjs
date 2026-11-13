import assert from 'node:assert/strict';
import test from 'node:test';

import { courseCta, isCourseArrival, postSignInTarget } from '../lib/courseArrival.js';

// Milestone 3.2 Developer Plan, Module 6.

test('buyers arriving from the GHL dashboard link or a course page are recognised', () => {
  assert.equal(isCourseArrival('/dashboard'), true);
  assert.equal(isCourseArrival('/courses/6ad790dd9fefeb3ba6d95838'), true);
  assert.equal(isCourseArrival('/'), false);
  assert.equal(isCourseArrival('/account'), false);
  assert.equal(isCourseArrival(null), false);
});

test('a sign-in that unlocked courses goes to the dashboard unless a specific page was requested', () => {
  assert.equal(postSignInTarget('/', 1), '/dashboard');
  assert.equal(postSignInTarget('', 2), '/dashboard');
  assert.equal(postSignInTarget('/courses/abc', 1), '/courses/abc');
  assert.equal(postSignInTarget('/', 0), '/');
  assert.equal(postSignInTarget('/', undefined), '/');
});

test('only same-site paths are honoured as a requested target', () => {
  assert.equal(postSignInTarget('https://evil.example.com', 1), '/dashboard');
  assert.equal(postSignInTarget('//evil.example.com', 0), '/');
});

test('a published GHL course gets an Enroll link to its order form', () => {
  const cta = courseCta({ slug: 'leadership', checkoutMethod: 'ghl', checkoutUrl: 'https://pay.example.com/l' });
  assert.deepEqual(cta, { label: 'Enroll now', href: 'https://pay.example.com/l', ghl: true, analyticsId: 'training_leadership' });
});

test('a Stripe course keeps native checkout', () => {
  assert.deepEqual(courseCta({ slug: 'leadership', checkoutMethod: 'stripe', checkoutUrl: '' }), { label: 'Purchase course', productKey: 'course:leadership', analyticsId: 'training_leadership' });
});

test('a GHL course without a usable https order form falls back to native checkout', () => {
  assert.equal(courseCta({ slug: 'x', checkoutMethod: 'ghl', checkoutUrl: '' }).productKey, 'course:x');
  assert.equal(courseCta({ slug: 'x', checkoutMethod: 'ghl', checkoutUrl: 'javascript:alert(1)' }).productKey, 'course:x');
});
