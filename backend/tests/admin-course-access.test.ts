import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import Course from '../src/models/course.model.ts';
import CoursePurchase from '../src/models/course-purchase.model.ts';
import CourseProgress from '../src/models/course-progress.model.ts';
import PendingCourseGrant from '../src/models/pending-course-grant.model.ts';
import User from '../src/models/user.model.ts';
import { grantAdminCourseAccess, listAdminCourseAccess, revokeAdminCourseAccess } from '../src/features/admin/admin-course-access.controller.ts';

// Milestone 3.2 Developer Plan, Module 5: admins grant and revoke course
// access by email (different checkout email, refunds, comps).
const COURSE_ID = '6ad790dd9fefeb3ba6d95838';
const USER_ID = '6ad790dd9fefeb3ba6d95900';
const response = () => ({ statusCode: 200, body: null as any, status(code: number) { this.statusCode = code; return this; }, json(body: any) { this.body = body; return this; } });
const lean = (value: unknown) => ({ lean: async () => value });
const req = (body: Record<string, unknown> = {}, idOrSlug = 'ai-edge') => ({ params: { idOrSlug }, body, user: { id: 'admin' } }) as any;

function setup(t: any, { user = null as any, course = { _id: COURSE_ID, slug: 'ai-edge' } as any, purchaseMatched = 1 } = {}) {
  t.after(() => mock.restoreAll());
  mock.method(console, 'log', () => {});
  mock.method(Course, 'findOne', () => lean(course));
  const userFind = mock.method(User, 'findOne', () => lean(user));
  const purchase = mock.method(CoursePurchase, 'updateOne', async () => ({ matchedCount: purchaseMatched }));
  mock.method(CourseProgress, 'updateOne', async () => ({}));
  const pending = mock.method(PendingCourseGrant, 'create', async (doc: any) => doc);
  mock.method(PendingCourseGrant, 'find', () => lean([]));
  return { userFind, purchase, pending };
}

test('granting to a verified account unlocks the course immediately as an admin grant', async (t) => {
  const { userFind, purchase, pending } = setup(t, { user: { _id: USER_ID, email: 'buyer@example.com', verified: true } });
  const res = response();
  await grantAdminCourseAccess(req({ email: ' Buyer@Example.com ', item: 'course' }), res as any);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { status: 'granted' });
  assert.deepEqual(userFind.mock.calls[0].arguments[0], { email: 'buyer@example.com' });
  assert.equal((purchase.mock.calls[0].arguments[1] as any).$setOnInsert.source, 'admin');
  assert.equal(pending.mock.callCount(), 0);
});

test('granting to an email without a verified account creates a pending admin grant', async (t) => {
  const { purchase, pending } = setup(t, { user: { _id: USER_ID, email: 'buyer@example.com', verified: false } });
  const res = response();
  await grantAdminCourseAccess(req({ email: 'buyer@example.com', item: 'course' }), res as any);
  assert.deepEqual(res.body, { status: 'pending' });
  assert.equal(purchase.mock.callCount(), 0);
  const doc = pending.mock.calls[0].arguments[0] as any;
  assert.equal(doc.source, 'admin');
  assert.equal(doc.item, 'course');
  assert.match(doc.externalOrderId, /^admin:/);
});

test('granting a workbook to someone who does not own the course stays pending', async (t) => {
  const { pending } = setup(t, { user: { _id: USER_ID, email: 'buyer@example.com', verified: true }, purchaseMatched: 0 });
  const res = response();
  await grantAdminCourseAccess(req({ email: 'buyer@example.com', item: 'workbook' }), res as any);
  assert.deepEqual(res.body, { status: 'pending' });
  assert.equal((pending.mock.calls[0].arguments[0] as any).item, 'workbook');
});

test('grant input is validated', async (t) => {
  setup(t);
  for (const body of [{ email: 'nope', item: 'course' }, { email: 'a@b.co', item: 'ebook' }]) {
    const res = response();
    await grantAdminCourseAccess(req(body), res as any);
    assert.equal(res.statusCode, 400);
  }
});

test('granting on an unknown course returns 404', async (t) => {
  setup(t, { course: null });
  const res = response();
  await grantAdminCourseAccess(req({ email: 'a@b.co', item: 'course' }, 'missing'), res as any);
  assert.equal(res.statusCode, 404);
});

test('revoking removes the user\'s purchases and unclaimed pending grants for that course only', async (t) => {
  setup(t, { user: { _id: USER_ID, email: 'buyer@example.com', verified: true } });
  const removePurchases = mock.method(CoursePurchase, 'deleteMany', async () => ({ deletedCount: 1 }));
  const removePending = mock.method(PendingCourseGrant, 'deleteMany', async () => ({ deletedCount: 2 }));
  const res = response();
  await revokeAdminCourseAccess(req({ email: 'Buyer@Example.com' }), res as any);
  assert.deepEqual(res.body, { removedPurchases: 1, removedPending: 2 });
  assert.deepEqual(removePurchases.mock.calls[0].arguments[0], { userId: USER_ID, courseId: COURSE_ID });
  assert.deepEqual(removePending.mock.calls[0].arguments[0], { email: 'buyer@example.com', courseId: COURSE_ID, claimedAt: null });
});

test('revoking for an email with no account still clears pending grants', async (t) => {
  setup(t);
  const removePurchases = mock.method(CoursePurchase, 'deleteMany', async () => ({ deletedCount: 0 }));
  mock.method(PendingCourseGrant, 'deleteMany', async () => ({ deletedCount: 1 }));
  const res = response();
  await revokeAdminCourseAccess(req({ email: 'buyer@example.com' }), res as any);
  assert.deepEqual(res.body, { removedPurchases: 0, removedPending: 1 });
  assert.equal(removePurchases.mock.callCount(), 0);
});

test('listing access shows owners with their source and add-ons, and unclaimed pending grants', async (t) => {
  setup(t);
  mock.method(CoursePurchase, 'find', () => ({ populate: () => ({ sort: () => ({ limit: () => lean([
    { _id: 'p1', userId: { _id: USER_ID, email: 'buyer@example.com' }, source: 'ghl', addons: ['workbook'], purchasedAt: new Date('2026-11-16') },
    { _id: 'p2', userId: null, purchasedAt: new Date('2026-11-15') },
  ]) }) }) }));
  const pendingFind = mock.method(PendingCourseGrant, 'find', () => ({ sort: () => ({ limit: () => lean([{ _id: 'g1', email: 'new@example.com', item: 'course', source: 'ghl', createdAt: new Date('2026-11-16') }]) }) }));
  const res = response();
  await listAdminCourseAccess(req(), res as any);
  assert.deepEqual(res.body.owners, [{ purchaseId: 'p1', email: 'buyer@example.com', source: 'ghl', addons: ['workbook'], purchasedAt: new Date('2026-11-16') }]);
  assert.deepEqual(res.body.pending, [{ id: 'g1', email: 'new@example.com', item: 'course', source: 'ghl', createdAt: new Date('2026-11-16') }]);
  assert.deepEqual(pendingFind.mock.calls[0].arguments[0], { courseId: COURSE_ID, claimedAt: null });
});
