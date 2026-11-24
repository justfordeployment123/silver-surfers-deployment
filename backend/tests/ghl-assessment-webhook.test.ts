import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import Assessment from '../src/models/assessment.model.ts';
import Course from '../src/models/course.model.ts';
import CoursePurchase from '../src/models/course-purchase.model.ts';
import PendingCourseGrant from '../src/models/pending-course-grant.model.ts';
import User from '../src/models/user.model.ts';
import { QUESTIONNAIRE_VERSION } from '../src/features/assessments/assessment-questions.ts';
import { claimPendingGrants } from '../src/features/courses/course-access.service.ts';
import { handleGhlPurchase } from '../src/features/integrations/ghl.controller.ts';

// The AI Readiness Assessment is sold through a GHL order form (client,
// 2026-11-24) and unlocked by the same webhook as the trainings, with
// item "assessment" and no courseSlug.
const SECRET = 'test-ghl-secret';
const USER_ID = '6ad790dd9fefeb3ba6d95900';

const response = () => ({ statusCode: 200, body: null as any, status(code: number) { this.statusCode = code; return this; }, json(body: any) { this.body = body; return this; } });
const lean = (value: unknown) => ({ lean: async () => value });
const body = (overrides: Record<string, unknown> = {}) => ({ orderId: 'ord_9', email: ' Buyer@Example.com ', item: 'assessment', amount: '497.00', ...overrides });
const request = (payload: any = body()) => ({
  body: payload,
  query: {},
  ip: '127.0.0.1',
  get: (name: string) => (name.toLowerCase() === 'x-silversurfers-secret' ? SECRET : undefined),
}) as any;

function setup(t: any, { user = null as any, duplicate = false } = {}) {
  const prior = process.env.GHL_WEBHOOK_SECRET;
  process.env.GHL_WEBHOOK_SECRET = SECRET;
  t.after(() => {
    mock.restoreAll();
    if (prior === undefined) delete process.env.GHL_WEBHOOK_SECRET;
    else process.env.GHL_WEBHOOK_SECRET = prior;
  });
  mock.method(console, 'log', () => {});
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
  const courseFind = mock.method(Course, 'findOne', () => lean(null));
  mock.method(CoursePurchase, 'exists', async () => null);
  mock.method(Assessment, 'exists', async () => (duplicate ? { _id: 'a' } : null));
  mock.method(PendingCourseGrant, 'exists', async () => null);
  mock.method(User, 'findOne', () => lean(user));
  const created = mock.method(Assessment, 'create', async (doc: any) => doc);
  const pending = mock.method(PendingCourseGrant, 'create', async (doc: any) => doc);
  mock.method(PendingCourseGrant, 'find', () => lean([]));
  return { courseFind, created, pending };
}

test('a verified buyer gets an assessment created, with no course lookup', async (t) => {
  const { courseFind, created, pending } = setup(t, { user: { _id: USER_ID, email: 'buyer@example.com', verified: true } });
  const res = response();
  await handleGhlPurchase(request(), res as any);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { status: 'granted' });
  assert.equal(courseFind.mock.callCount(), 0);
  assert.equal(pending.mock.callCount(), 0);
  const doc = created.mock.calls[0].arguments[0] as any;
  assert.equal(doc.userId, USER_ID);
  assert.equal(doc.status, 'purchased');
  assert.equal(doc.questionnaireVersion, QUESTIONNAIRE_VERSION);
  assert.equal(doc.externalOrderId, 'ghl:ord_9:assessment');
  assert.equal(doc.amount, 49700);
});

test('an email with no verified account is held as a pending assessment grant', async (t) => {
  const { created, pending } = setup(t);
  const res = response();
  await handleGhlPurchase(request(), res as any);
  assert.deepEqual(res.body, { status: 'pending' });
  assert.equal(created.mock.callCount(), 0);
  const doc = pending.mock.calls[0].arguments[0] as any;
  assert.equal(doc.email, 'buyer@example.com');
  assert.equal(doc.item, 'assessment');
  assert.equal(doc.courseId, undefined);
  assert.equal(doc.externalOrderId, 'ghl:ord_9:assessment');
  assert.equal(doc.amountCents, 49700);
});

test('a repeated assessment order is acknowledged without creating a second assessment', async (t) => {
  const { created, pending } = setup(t, { duplicate: true, user: { _id: USER_ID, email: 'buyer@example.com', verified: true } });
  const res = response();
  await handleGhlPurchase(request(), res as any);
  assert.deepEqual(res.body, { status: 'duplicate' });
  assert.equal(created.mock.callCount(), 0);
  assert.equal(pending.mock.callCount(), 0);
});

test('two deliveries racing the same assessment order create only one', async (t) => {
  const { created } = setup(t, { user: { _id: USER_ID, email: 'buyer@example.com', verified: true } });
  created.mock.mockImplementation(async () => { throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 }); });
  const res = response();
  await handleGhlPurchase(request(), res as any);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { status: 'duplicate' });
});

test('courses and workbooks still need a courseSlug', async (t) => {
  setup(t);
  for (const item of ['course', 'workbook']) {
    const res = response();
    await handleGhlPurchase(request(body({ item })), res as any);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /courseSlug/);
  }
});

test('an unknown item is still rejected', async (t) => {
  setup(t);
  const res = response();
  await handleGhlPurchase(request(body({ item: 'ebook' })), res as any);
  assert.equal(res.statusCode, 400);
});

test('claiming pending grants creates the waiting assessment and marks it claimed', async (t) => {
  const { created } = setup(t);
  const grant = { _id: 'g1', email: 'buyer@example.com', item: 'assessment', source: 'ghl', externalOrderId: 'ghl:ord_9:assessment', amountCents: 49700, claimedAt: null };
  mock.method(PendingCourseGrant, 'find', () => lean([grant]));
  const marked = mock.method(PendingCourseGrant, 'updateOne', async () => ({}));
  const result = await claimPendingGrants({ _id: USER_ID, email: 'buyer@example.com' });
  assert.deepEqual(result, { claimed: 1 });
  const doc = created.mock.calls[0].arguments[0] as any;
  assert.equal(doc.userId, USER_ID);
  assert.equal(doc.externalOrderId, 'ghl:ord_9:assessment');
  assert.equal(doc.amount, 49700);
  assert.equal(marked.mock.callCount(), 1);
});

test('claiming an assessment that already exists does not fail or duplicate it', async (t) => {
  const { created } = setup(t);
  created.mock.mockImplementation(async () => { throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 }); });
  mock.method(PendingCourseGrant, 'find', () => lean([{ _id: 'g1', item: 'assessment', externalOrderId: 'ghl:ord_9:assessment', claimedAt: null }]));
  const marked = mock.method(PendingCourseGrant, 'updateOne', async () => ({}));
  const result = await claimPendingGrants({ _id: USER_ID, email: 'buyer@example.com' });
  assert.deepEqual(result, { claimed: 1 });
  assert.equal(marked.mock.callCount(), 1);
});

test('the pending grant model allows an assessment without a course but still requires one for courses', () => {
  const assessmentGrant = new (PendingCourseGrant as any)({ email: 'a@b.co', item: 'assessment', externalOrderId: 'x1' });
  assert.equal(assessmentGrant.validateSync(), undefined);
  const courseGrant = new (PendingCourseGrant as any)({ email: 'a@b.co', item: 'course', externalOrderId: 'x2' });
  assert.ok(courseGrant.validateSync()?.errors?.courseId);
});

test('the assessment model records the GHL order id', () => {
  assert.ok((Assessment as any).schema.path('externalOrderId'));
});
