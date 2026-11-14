import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import CoursePurchase from '../src/models/course-purchase.model.ts';
import CourseProgress from '../src/models/course-progress.model.ts';
import { getMyCourses } from '../src/features/dashboard/dashboard.controller.ts';

// Bug found 2026-11-15: jackie@silversurfers.ai's dashboard showed AI Edge
// 7 times because a Stripe webhook retry bug had inserted 7 purchase rows
// for the same course. The dashboard dedupes by course as a safety net,
// on top of the database-level fix in course-access.service.ts.
const USER_ID = '6ad790dd9fefeb3ba6d95900';
const course = { _id: 'course-1', title: 'AI Edge', slug: 'ai-edge', modules: [] };
const response = () => ({ statusCode: 200, body: null as any, status(code: number) { this.statusCode = code; return this; }, json(body: any) { this.body = body; return this; } });

test('duplicate purchase rows for the same course show as one dashboard card', async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(CoursePurchase, 'find', () => ({ populate: () => ({ sort: () => ({ lean: async () => [
    { courseId: course, purchasedAt: new Date('2026-11-13') },
    { courseId: course, purchasedAt: new Date('2026-11-12') },
    { courseId: course, purchasedAt: new Date('2026-11-11') },
  ] }) }) }));
  mock.method(CourseProgress, 'find', () => ({ lean: async () => [] }));
  const res = response();
  await getMyCourses({ user: { id: USER_ID } } as any, res as any);
  assert.equal(res.body.courses.length, 1);
  assert.equal(res.body.courses[0].courseId, 'course-1');
});

test('two different owned courses still both appear', async (t) => {
  t.after(() => mock.restoreAll());
  const other = { _id: 'course-2', title: 'Other', slug: 'other', modules: [] };
  mock.method(CoursePurchase, 'find', () => ({ populate: () => ({ sort: () => ({ lean: async () => [
    { courseId: course, purchasedAt: new Date('2026-11-13') },
    { courseId: other, purchasedAt: new Date('2026-11-12') },
  ] }) }) }));
  mock.method(CourseProgress, 'find', () => ({ lean: async () => [] }));
  const res = response();
  await getMyCourses({ user: { id: USER_ID } } as any, res as any);
  assert.deepEqual(res.body.courses.map((c: any) => c.courseId).sort(), ['course-1', 'course-2']);
});
