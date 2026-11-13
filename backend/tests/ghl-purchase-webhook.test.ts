import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import Course from '../src/models/course.model.ts';
import CoursePurchase from '../src/models/course-purchase.model.ts';
import CourseProgress from '../src/models/course-progress.model.ts';
import PendingCourseGrant from '../src/models/pending-course-grant.model.ts';
import User from '../src/models/user.model.ts';
import { handleGhlPurchase, parseAmountCents } from '../src/features/integrations/ghl.controller.ts';

// Milestone 3.2 Developer Plan, Module 3: POST /integrations/ghl/purchase.
const SECRET = 'test-ghl-secret';
const COURSE_ID = '6ad790dd9fefeb3ba6d95838';
const USER_ID = '6ad790dd9fefeb3ba6d95900';

const response = () => ({ statusCode: 200, body: null as any, status(code: number) { this.statusCode = code; return this; }, json(body: any) { this.body = body; return this; } });
const lean = (value: unknown) => ({ lean: async () => value });
const validBody = (overrides: Record<string, unknown> = {}) => ({ orderId: 'ord_1', email: ' Buyer@Example.com ', firstName: 'Ann', courseSlug: 'AI-Edge', item: 'course', amount: '197.00', ...overrides });
const request = ({ body = validBody(), header = SECRET as string | null, token = undefined as string | undefined } = {}) => ({
  body,
  query: token === undefined ? {} : { token },
  ip: '127.0.0.1',
  get: (name: string) => (name.toLowerCase() === 'x-silversurfers-secret' ? header ?? undefined : undefined),
}) as any;

function setup(t: any, { user = null as any, duplicate = false, purchaseMatched = 1 } = {}) {
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
  const courseFind = mock.method(Course, 'findOne', (filter: any) => lean(filter.slug === 'ai-edge' ? { _id: COURSE_ID, slug: 'ai-edge' } : null));
  mock.method(CoursePurchase, 'exists', async () => (duplicate ? { _id: 'p' } : null));
  mock.method(PendingCourseGrant, 'exists', async () => null);
  const userFind = mock.method(User, 'findOne', () => lean(user));
  const purchase = mock.method(CoursePurchase, 'updateOne', async () => ({ matchedCount: purchaseMatched }));
  const progress = mock.method(CourseProgress, 'updateOne', async () => ({}));
  const pending = mock.method(PendingCourseGrant, 'create', async (doc: any) => doc);
  mock.method(PendingCourseGrant, 'find', () => lean([]));
  return { courseFind, userFind, purchase, progress, pending };
}

test('the webhook fails closed when no secret is configured', async (t) => {
  setup(t);
  delete process.env.GHL_WEBHOOK_SECRET;
  const res = response();
  await handleGhlPurchase(request(), res as any);
  assert.equal(res.statusCode, 503);
});

test('a missing or wrong secret is rejected before anything is read', async (t) => {
  const { courseFind } = setup(t);
  for (const req of [request({ header: null }), request({ header: 'wrong' }), request({ header: null, token: 'wrong' })]) {
    const res = response();
    await handleGhlPurchase(req, res as any);
    assert.equal(res.statusCode, 401);
  }
  assert.equal(courseFind.mock.callCount(), 0);
});

test('the secret is also accepted as a token query parameter', async (t) => {
  setup(t);
  const res = response();
  await handleGhlPurchase(request({ header: null, token: SECRET }), res as any);
  assert.equal(res.statusCode, 200);
});

test('invalid payloads are rejected with a readable reason', async (t) => {
  setup(t);
  const cases = [
    validBody({ email: 'not-an-email' }),
    validBody({ orderId: '' }),
    validBody({ item: 'ebook' }),
    validBody({ courseSlug: '' }),
  ];
  for (const body of cases) {
    const res = response();
    await handleGhlPurchase(request({ body }), res as any);
    assert.equal(res.statusCode, 400);
    assert.equal(typeof res.body.error, 'string');
  }
});

test('an unknown course slug is rejected', async (t) => {
  setup(t);
  const res = response();
  await handleGhlPurchase(request({ body: validBody({ courseSlug: 'no-such-course' }) }), res as any);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /course/i);
});

test('a verified existing buyer is granted the course immediately', async (t) => {
  const { userFind, purchase, progress, pending } = setup(t, { user: { _id: USER_ID, email: 'buyer@example.com', verified: true } });
  const res = response();
  await handleGhlPurchase(request(), res as any);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { status: 'granted' });
  assert.deepEqual(userFind.mock.calls[0].arguments[0], { email: 'buyer@example.com', verified: true });
  const [filter, update] = purchase.mock.calls[0].arguments as any[];
  assert.deepEqual(filter, { userId: USER_ID, courseId: COURSE_ID });
  assert.equal(update.$setOnInsert.source, 'ghl');
  assert.equal(update.$setOnInsert.externalOrderId, 'ghl:ord_1:course');
  assert.equal(update.$setOnInsert.amount, 19700);
  assert.equal(progress.mock.callCount(), 1);
  assert.equal(pending.mock.callCount(), 0);
});

test('an email with no verified account creates a pending grant', async (t) => {
  const { purchase, pending } = setup(t);
  const res = response();
  await handleGhlPurchase(request(), res as any);
  assert.deepEqual(res.body, { status: 'pending' });
  assert.equal(purchase.mock.callCount(), 0);
  const doc = pending.mock.calls[0].arguments[0] as any;
  assert.equal(doc.email, 'buyer@example.com');
  assert.equal(String(doc.courseId), COURSE_ID);
  assert.equal(doc.item, 'course');
  assert.equal(doc.source, 'ghl');
  assert.equal(doc.externalOrderId, 'ghl:ord_1:course');
  assert.equal(doc.amountCents, 19700);
});

test('a repeated order is acknowledged without writing anything', async (t) => {
  const { purchase, pending } = setup(t, { duplicate: true, user: { _id: USER_ID, email: 'buyer@example.com', verified: true } });
  const res = response();
  await handleGhlPurchase(request(), res as any);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { status: 'duplicate' });
  assert.equal(purchase.mock.callCount(), 0);
  assert.equal(pending.mock.callCount(), 0);
});

test('a concurrent duplicate pending grant is acknowledged as a duplicate', async (t) => {
  const { pending } = setup(t);
  pending.mock.mockImplementation(async () => { throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 }); });
  const res = response();
  await handleGhlPurchase(request(), res as any);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { status: 'duplicate' });
});

test('a workbook for a buyer who owns the course is recorded as an add-on', async (t) => {
  const { purchase, pending } = setup(t, { user: { _id: USER_ID, email: 'buyer@example.com', verified: true } });
  const res = response();
  await handleGhlPurchase(request({ body: validBody({ item: 'workbook', amount: '37' }) }), res as any);
  assert.deepEqual(res.body, { status: 'granted' });
  assert.deepEqual(purchase.mock.calls[0].arguments, [{ userId: USER_ID, courseId: COURSE_ID }, { $addToSet: { addons: 'workbook' } }]);
  assert.equal(pending.mock.callCount(), 0);
});

test('a workbook that arrives before the course stays pending', async (t) => {
  const { pending } = setup(t, { user: { _id: USER_ID, email: 'buyer@example.com', verified: true }, purchaseMatched: 0 });
  const res = response();
  await handleGhlPurchase(request({ body: validBody({ item: 'workbook', amount: '37' }) }), res as any);
  assert.deepEqual(res.body, { status: 'pending' });
  assert.equal((pending.mock.calls[0].arguments[0] as any).externalOrderId, 'ghl:ord_1:workbook');
});

test('GHL amount formats are parsed into cents', () => {
  assert.equal(parseAmountCents('197.00'), 19700);
  assert.equal(parseAmountCents('$1,197.50'), 119750);
  assert.equal(parseAmountCents(37), 3700);
  assert.equal(parseAmountCents(''), undefined);
  assert.equal(parseAmountCents('free'), undefined);
});

test('the webhook rate limit blocks a burst from one IP and resets after the window', async () => {
  const { createIpRateLimit } = await import('../src/features/integrations/ghl.routes.ts');
  let time = 0;
  const limit = createIpRateLimit(2, 1000, () => time);
  const run = (ip: string) => { const res = response(); let passed = false; limit({ ip } as any, res as any, () => { passed = true; }); return passed ? 200 : res.statusCode; };
  assert.deepEqual([run('1.1.1.1'), run('1.1.1.1'), run('1.1.1.1'), run('2.2.2.2')], [200, 200, 429, 200]);
  time = 1000;
  assert.equal(run('1.1.1.1'), 200);
});

// Jackie, 2026-11-14: GHL runs one workflow per product, so a course + workbook
// order sends two webhooks for the same buyer, in either order.
test('course and workbook webhooks for one order both land, whichever arrives first', async (t) => {
  const user = { _id: USER_ID, email: 'buyer@example.com', verified: true };
  const { purchase, pending } = setup(t, { user });
  const pendingRows: any[] = [];
  let ownsCourse = false;
  pending.mock.mockImplementation(async (doc: any) => { pendingRows.push({ _id: `g${pendingRows.length}`, claimedAt: null, ...doc }); return doc; });
  mock.method(PendingCourseGrant, 'find', () => lean(pendingRows.filter((row) => !row.claimedAt)));
  mock.method(PendingCourseGrant, 'updateOne', async (filter: any) => { const row = pendingRows.find((r) => r._id === filter._id); if (row) row.claimedAt = new Date(); return {}; });
  purchase.mock.mockImplementation(async (_filter: any, update: any) => {
    if (update.$setOnInsert) { ownsCourse = true; return { matchedCount: 0, upsertedCount: 1 }; }
    return { matchedCount: ownsCourse ? 1 : 0 };
  });

  const workbookFirst = response();
  await handleGhlPurchase(request({ body: validBody({ item: 'workbook', amount: '37' }) }), workbookFirst as any);
  assert.deepEqual(workbookFirst.body, { status: 'pending' });

  const courseSecond = response();
  await handleGhlPurchase(request(), courseSecond as any);
  assert.deepEqual(courseSecond.body, { status: 'granted' });

  const addonWrites = purchase.mock.calls.filter((call: any) => call.arguments[1].$addToSet);
  assert.equal(addonWrites.length, 2);
  assert.deepEqual(addonWrites.at(-1)!.arguments[1], { $addToSet: { addons: 'workbook' } });
  assert.ok(pendingRows.every((row) => row.claimedAt), 'the waiting workbook was attached');
  assert.deepEqual(pendingRows.map((row) => row.externalOrderId), ['ghl:ord_1:workbook']);
});
