import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { mock } from 'node:test';
import bcrypt from 'bcryptjs';

import authRouter from '../src/features/auth/auth.routes.ts';
import CoursePurchase from '../src/models/course-purchase.model.ts';
import CourseProgress from '../src/models/course-progress.model.ts';
import PendingCourseGrant from '../src/models/pending-course-grant.model.ts';
import User from '../src/models/user.model.ts';
import { claimGrantsSafely } from '../src/features/courses/course-access.service.ts';

// Milestone 3.2 Developer Plan, Module 4: pending GHL purchases are claimed
// when the buyer verifies their email or logs in, never before.
const USER_ID = '6ad790dd9fefeb3ba6d95900';
const COURSE_ID = '6ad790dd9fefeb3ba6d95838';
const pendingCourse = { _id: 'g1', email: 'buyer@example.com', courseId: COURSE_ID, item: 'course', externalOrderId: 'ghl:o1:course', source: 'ghl' };

function callRoute(path: string, body: Record<string, unknown>): Promise<{ statusCode: number; body: any }> {
  const layer: any = (authRouter as any).stack.find((candidate: any) => candidate.route?.path === path && candidate.route?.methods?.post);
  assert.ok(layer, `route ${path} not found`);
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this; },
      json(payload: unknown) { resolve({ statusCode: this.statusCode, body: payload }); return this; },
    };
    layer.route.stack[0].handle({ body, get: () => undefined } as any, res as any, (error: unknown) => reject(error ?? new Error('next() called')));
  });
}

function mockGrants(t: any, grants: unknown[] = [pendingCourse]) {
  t.after(() => mock.restoreAll());
  mock.method(console, 'log', () => {});
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
  const find = mock.method(PendingCourseGrant, 'find', () => ({ lean: async () => grants }));
  const purchase = mock.method(CoursePurchase, 'updateOne', async () => ({ matchedCount: 1 }));
  mock.method(CourseProgress, 'updateOne', async () => ({}));
  mock.method(PendingCourseGrant, 'updateOne', async () => ({}));
  return { find, purchase };
}

test('verifying an email claims that email\'s pending course purchases', async (t) => {
  const { find, purchase } = mockGrants(t);
  const user: any = { _id: USER_ID, email: 'buyer@example.com', role: 'user', verified: false, accountStatus: 'active', save: async () => {} };
  mock.method(User, 'findOne', async () => user);

  const result = await callRoute('/verify-email', { token: 'abc' });

  assert.equal(result.statusCode, 200);
  assert.equal(user.verified, true);
  assert.equal(result.body.claimedCourses, 1);
  assert.deepEqual(find.mock.calls[0].arguments[0], { email: 'buyer@example.com', claimedAt: null });
  assert.equal(purchase.mock.callCount(), 1);
});

test('logging in claims pending purchases for a verified account', async (t) => {
  const { purchase } = mockGrants(t);
  const passwordHash = await bcrypt.hash('secret-pass', 4);
  mock.method(User, 'findOne', async () => ({ _id: USER_ID, email: 'buyer@example.com', role: 'user', verified: true, accountStatus: 'active', passwordHash }));

  const result = await callRoute('/login', { email: 'Buyer@Example.com', password: 'secret-pass' });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.claimedCourses, 1);
  assert.equal(purchase.mock.callCount(), 1);
});

test('an unverified account cannot log in and claims nothing', async (t) => {
  const { find } = mockGrants(t);
  const passwordHash = await bcrypt.hash('secret-pass', 4);
  mock.method(User, 'findOne', async () => ({ _id: USER_ID, email: 'buyer@example.com', verified: false, accountStatus: 'active', passwordHash }));

  const result = await callRoute('/login', { email: 'buyer@example.com', password: 'secret-pass' });

  assert.equal(result.statusCode, 403);
  assert.equal(find.mock.callCount(), 0);
});

test('a wrong password claims nothing', async (t) => {
  const { find } = mockGrants(t);
  const passwordHash = await bcrypt.hash('secret-pass', 4);
  mock.method(User, 'findOne', async () => ({ _id: USER_ID, email: 'buyer@example.com', verified: true, accountStatus: 'active', passwordHash }));

  const result = await callRoute('/login', { email: 'buyer@example.com', password: crypto.randomUUID() });

  assert.equal(result.statusCode, 401);
  assert.equal(find.mock.callCount(), 0);
});

test('a claim failure never blocks login', async (t) => {
  mockGrants(t);
  mock.method(PendingCourseGrant, 'find', () => ({ lean: async () => { throw new Error('database unavailable'); } }));
  const passwordHash = await bcrypt.hash('secret-pass', 4);
  mock.method(User, 'findOne', async () => ({ _id: USER_ID, email: 'buyer@example.com', role: 'user', verified: true, accountStatus: 'active', passwordHash }));

  const result = await callRoute('/login', { email: 'buyer@example.com', password: 'secret-pass' });

  assert.equal(result.statusCode, 200);
  assert.ok(result.body.token);
  assert.equal(result.body.claimedCourses, 0);
});

test('claimGrantsSafely reports zero instead of throwing', async (t) => {
  mockGrants(t);
  mock.method(PendingCourseGrant, 'find', () => ({ lean: async () => { throw new Error('boom'); } }));
  assert.deepEqual(await claimGrantsSafely({ _id: USER_ID, email: 'buyer@example.com' }), { claimed: 0 });
});

test('a password reset that signs a verified user in also claims their purchases', async (t) => {
  const { purchase } = mockGrants(t);
  mock.method(User, 'findOne', async () => ({ _id: USER_ID, email: 'buyer@example.com', role: 'user', verified: true, save: async () => {} }));

  const result = await callRoute('/reset-password', { token: 'reset', password: 'new-password' });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.claimedCourses, 1);
  assert.equal(purchase.mock.callCount(), 1);
});

test('a password reset on an unverified account claims nothing', async (t) => {
  const { find } = mockGrants(t);
  mock.method(User, 'findOne', async () => ({ _id: USER_ID, email: 'buyer@example.com', role: 'user', verified: false, save: async () => {} }));

  const result = await callRoute('/reset-password', { token: 'reset', password: 'new-password' });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.claimedCourses, 0);
  assert.equal(find.mock.callCount(), 0);
});
