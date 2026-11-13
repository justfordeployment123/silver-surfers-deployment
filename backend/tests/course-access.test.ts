import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import Course from '../src/models/course.model.ts';
import CoursePurchase from '../src/models/course-purchase.model.ts';
import CourseProgress from '../src/models/course-progress.model.ts';
import { getCourse, markLessonComplete } from '../src/features/courses/course.controller.ts';

// Milestone 3.2 Developer Plan, Module 0: an unknown or malformed course URL
// must answer 404 "Course not found.", never a 500 "Failed to load course.".
const VALID_ID = '6ad790dd9fefeb3ba6d95838';
const MISSING_ID = '6ad790dd9fefeb3ba6d95839';

const response = () => ({ statusCode: 200, body: null as any, status(code: number) { this.statusCode = code; return this; }, json(body: any) { this.body = body; return this; } });
const lean = (value: unknown) => ({ lean: async () => value });
const course = { _id: VALID_ID, slug: 'ai-edge', title: 'AI Edge', modules: [{ moduleId: 'm1', lessons: [{ lessonId: 'l1' }] }] };

function mockCourses(t: any, { owned }: { owned: boolean }) {
  t.after(() => mock.restoreAll());
  mock.method(Course, 'findById', (id: string) => lean(id === VALID_ID ? course : null));
  mock.method(CoursePurchase, 'findOne', () => lean(owned ? { _id: 'purchase' } : null));
  mock.method(CoursePurchase, 'exists', async () => null);
  mock.method(CourseProgress, 'findOne', () => lean(null));
}

const getRequest = (courseId: string) => ({ user: { id: 'user' }, params: { courseId }, query: {} }) as any;
const progressRequest = (courseId: string) => ({ user: { id: 'user' }, params: { courseId }, query: {}, body: { lessonId: 'l1' } }) as any;

test('a slug or malformed course ID returns 404 instead of a server error', async (t) => {
  mockCourses(t, { owned: false });
  const res = response();
  await getCourse(getRequest('ai-edge'), res as any);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Course not found.' });
});

test('a well-formed ID for a course that does not exist returns 404, not 403', async (t) => {
  mockCourses(t, { owned: false });
  const res = response();
  await getCourse(getRequest(MISSING_ID), res as any);
  assert.equal(res.statusCode, 404);
});

test('an existing course the user does not own returns 403', async (t) => {
  mockCourses(t, { owned: false });
  const res = response();
  await getCourse(getRequest(VALID_ID), res as any);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'You do not own this course.' });
});

test('an owned course loads with empty progress', async (t) => {
  mockCourses(t, { owned: true });
  const res = response();
  await getCourse(getRequest(VALID_ID), res as any);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.course.slug, 'ai-edge');
  assert.deepEqual(res.body.progress, { moduleProgress: [] });
});

test('saving progress on a slug or malformed course ID returns 404', async (t) => {
  mockCourses(t, { owned: false });
  const res = response();
  await markLessonComplete(progressRequest('ai-edge'), res as any);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Course not found.' });
});

test('saving progress on a missing course returns 404 and on an unowned course 403', async (t) => {
  mockCourses(t, { owned: false });
  const missing = response();
  await markLessonComplete(progressRequest(MISSING_ID), missing as any);
  assert.equal(missing.statusCode, 404);

  const unowned = response();
  await markLessonComplete(progressRequest(VALID_ID), unowned as any);
  assert.equal(unowned.statusCode, 403);
});

// Milestone 3.2 Developer Plan, Module 7: the training page offers the GHL
// workbook order form only to buyers who do not own the workbook yet.
test('the course response includes the workbook link and whether the buyer owns it', async (t) => {
  mockCourses(t, { owned: true });
  mock.method(Course, 'findById', () => lean({ ...course, ghlWorkbookUrl: 'https://pay.example.com/workbook' }));
  const exists = mock.method(CoursePurchase, 'exists', async () => ({ _id: 'purchase' }));
  const res = response();
  await getCourse(getRequest(VALID_ID), res as any);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.workbookUrl, 'https://pay.example.com/workbook');
  assert.equal(res.body.ownsWorkbook, true);
  assert.deepEqual(exists.mock.calls[0].arguments[0], { userId: 'user', courseId: VALID_ID, addons: 'workbook' });
});

test('a buyer without the workbook sees ownsWorkbook false, and no link when none is configured', async (t) => {
  mockCourses(t, { owned: true });
  mock.method(CoursePurchase, 'exists', async () => null);
  const res = response();
  await getCourse(getRequest(VALID_ID), res as any);
  assert.equal(res.body.workbookUrl, '');
  assert.equal(res.body.ownsWorkbook, false);
});

test('the course response never exposes checkout configuration fields', async (t) => {
  mockCourses(t, { owned: true });
  mock.method(Course, 'findById', () => lean({ ...course, stripePriceId: 'price_secret', ghlCheckoutUrl: 'https://pay.example.com/course', ghlWorkbookUrl: 'https://pay.example.com/workbook' }));
  mock.method(CoursePurchase, 'exists', async () => null);
  const res = response();
  await getCourse(getRequest(VALID_ID), res as any);
  assert.equal(res.body.course.stripePriceId, undefined);
  assert.equal(res.body.course.ghlCheckoutUrl, undefined);
});
