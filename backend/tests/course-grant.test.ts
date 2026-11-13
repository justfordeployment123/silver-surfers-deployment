import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import Course from '../src/models/course.model.ts';
import CoursePurchase from '../src/models/course-purchase.model.ts';
import CourseProgress from '../src/models/course-progress.model.ts';
import PendingCourseGrant from '../src/models/pending-course-grant.model.ts';
import { claimPendingGrants, grantAddon, grantCourse, ownsAddon } from '../src/features/courses/course-access.service.ts';

// Milestone 3.2 Developer Plan, Modules 1-2: GHL purchases, Stripe purchases
// and admin grants all unlock a course through one shared write path.
const COURSE_ID = '6ad790dd9fefeb3ba6d95838';
const USER_ID = '6ad790dd9fefeb3ba6d95900';

test('course model defaults new and existing courses to Stripe checkout', () => {
  const course: any = new (Course as any)({ slug: 'ai-edge', title: 'AI Edge' });
  assert.equal(course.checkoutMethod, 'stripe');
  assert.equal(course.ghlCheckoutUrl, '');
  assert.equal(course.ghlWorkbookUrl, '');
  assert.throws(() => { const invalid: any = new (Course as any)({ slug: 'x', title: 'X', checkoutMethod: 'paypal' }); const error = invalid.validateSync(); if (error) throw error; }, /checkoutMethod/);
});

test('course purchases record their source and add-ons without forcing an order ID', () => {
  const purchase: any = new (CoursePurchase as any)({ userId: USER_ID, courseId: COURSE_ID });
  assert.equal(purchase.source, 'stripe');
  assert.deepEqual([...purchase.addons], []);
  assert.equal(purchase.externalOrderId, undefined);
  const index = (CoursePurchase as any).schema.indexes().find(([fields]: any) => fields.externalOrderId === 1);
  assert.equal(index?.[1]?.unique, true);
  assert.equal(index?.[1]?.sparse, true);
});

test('pending grants require an email, item and unique order ID', () => {
  const grant: any = new (PendingCourseGrant as any)({ email: '  Buyer@Example.COM ', courseId: COURSE_ID, item: 'course', externalOrderId: 'ghl:1:course', source: 'ghl' });
  assert.equal(grant.email, 'buyer@example.com');
  assert.equal(grant.validateSync(), undefined);
  const missing: any = new (PendingCourseGrant as any)({ courseId: COURSE_ID, item: 'ebook' });
  const error = missing.validateSync();
  assert.ok(error.errors.email);
  assert.ok(error.errors.item);
  assert.ok(error.errors.externalOrderId);
  const index = (PendingCourseGrant as any).schema.indexes().find(([fields]: any) => fields.externalOrderId === 1);
  assert.equal(index?.[1]?.unique, true);
});

test('a GHL grant upserts one purchase per user and course and starts empty progress', async (t) => {
  t.after(() => mock.restoreAll());
  const purchase = mock.method(CoursePurchase, 'updateOne', async () => ({}));
  const progress = mock.method(CourseProgress, 'updateOne', async () => ({}));
  await grantCourse({ userId: USER_ID, courseId: COURSE_ID, source: 'ghl', externalOrderId: 'ghl:o1:course', amountCents: 19700 });

  const [filter, update, options] = purchase.mock.calls[0].arguments as any[];
  assert.deepEqual(filter, { userId: USER_ID, courseId: COURSE_ID });
  assert.equal(update.$setOnInsert.source, 'ghl');
  assert.equal(update.$setOnInsert.externalOrderId, 'ghl:o1:course');
  assert.equal(update.$setOnInsert.amount, 19700);
  assert.equal(update.$set, undefined);
  assert.deepEqual(options, { upsert: true });
  assert.deepEqual(progress.mock.calls[0].arguments[0], { userId: USER_ID, courseId: COURSE_ID });
  assert.ok((progress.mock.calls[0].arguments[1] as any).$setOnInsert);
});

test('a Stripe grant keeps one purchase per checkout session', async (t) => {
  t.after(() => mock.restoreAll());
  const purchase = mock.method(CoursePurchase, 'updateOne', async () => ({}));
  mock.method(CourseProgress, 'updateOne', async () => ({}));
  await grantCourse({ userId: USER_ID, courseId: COURSE_ID, source: 'stripe', stripeSessionId: 'cs_1', amountCents: 19700 });
  assert.deepEqual(purchase.mock.calls[0].arguments[0], { userId: USER_ID, courseId: COURSE_ID, stripeSessionId: 'cs_1' });
  assert.equal((purchase.mock.calls[0].arguments[1] as any).$setOnInsert.externalOrderId, undefined);
});

test('an add-on attaches only to an existing course purchase', async (t) => {
  t.after(() => mock.restoreAll());
  let matched = 1;
  const update = mock.method(CoursePurchase, 'updateOne', async () => ({ matchedCount: matched }));
  assert.equal(await grantAddon({ userId: USER_ID, courseId: COURSE_ID, addon: 'workbook' }), true);
  assert.deepEqual(update.mock.calls[0].arguments, [{ userId: USER_ID, courseId: COURSE_ID }, { $addToSet: { addons: 'workbook' } }]);
  matched = 0;
  assert.equal(await grantAddon({ userId: USER_ID, courseId: COURSE_ID, addon: 'workbook' }), false);
});

test('add-on ownership is checked across all of a user\'s purchases of that course', async (t) => {
  t.after(() => mock.restoreAll());
  const exists = mock.method(CoursePurchase, 'exists', async () => ({ _id: 'p' }));
  assert.equal(await ownsAddon(USER_ID, COURSE_ID, 'workbook'), true);
  assert.deepEqual(exists.mock.calls[0].arguments[0], { userId: USER_ID, courseId: COURSE_ID, addons: 'workbook' });
});

test('claiming applies course grants before workbooks and marks each claimed', async (t) => {
  t.after(() => mock.restoreAll());
  const workbook = { _id: 'g2', email: 'buyer@example.com', courseId: COURSE_ID, item: 'workbook', externalOrderId: 'ghl:o1:workbook', source: 'ghl' };
  const course = { _id: 'g1', email: 'buyer@example.com', courseId: COURSE_ID, item: 'course', externalOrderId: 'ghl:o1:course', source: 'ghl', amountCents: 19700 };
  const find = mock.method(PendingCourseGrant, 'find', () => ({ lean: async () => [workbook, course] }));
  const order: string[] = [];
  mock.method(CoursePurchase, 'updateOne', async (_filter: any, update: any) => { order.push(update.$addToSet ? 'workbook' : 'course'); return { matchedCount: 1 }; });
  mock.method(CourseProgress, 'updateOne', async () => ({}));
  const claimed = mock.method(PendingCourseGrant, 'updateOne', async () => ({}));

  const result = await claimPendingGrants({ _id: USER_ID, email: 'Buyer@Example.com' });

  assert.deepEqual(find.mock.calls[0].arguments[0], { email: 'buyer@example.com', claimedAt: null });
  assert.deepEqual(order, ['course', 'workbook']);
  assert.equal(result.claimed, 2);
  assert.deepEqual(claimed.mock.calls.map((call: any) => call.arguments[0]), [{ _id: 'g1', claimedAt: null }, { _id: 'g2', claimedAt: null }]);
  assert.equal(String((claimed.mock.calls[0].arguments[1] as any).$set.claimedByUserId), USER_ID);
});

test('a workbook with no course purchase stays pending', async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(PendingCourseGrant, 'find', () => ({ lean: async () => [{ _id: 'g2', email: 'buyer@example.com', courseId: COURSE_ID, item: 'workbook', externalOrderId: 'w', source: 'ghl' }] }));
  mock.method(CoursePurchase, 'updateOne', async () => ({ matchedCount: 0 }));
  const claimed = mock.method(PendingCourseGrant, 'updateOne', async () => ({}));
  const result = await claimPendingGrants({ _id: USER_ID, email: 'buyer@example.com' });
  assert.equal(result.claimed, 0);
  assert.equal(claimed.mock.callCount(), 0);
});

test('claiming does nothing for a user with no email', async (t) => {
  t.after(() => mock.restoreAll());
  const find = mock.method(PendingCourseGrant, 'find', () => ({ lean: async () => [] }));
  assert.deepEqual(await claimPendingGrants({ _id: USER_ID, email: '' }), { claimed: 0 });
  assert.equal(find.mock.callCount(), 0);
});
