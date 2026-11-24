import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import Course from '../src/models/course.model.ts';
import CourseImage from '../src/models/course-image.model.ts';
import { deleteAdminCourseImage, getPublicCourseImage, uploadAdminCourseImage } from '../src/features/courses/course-image.controller.ts';
import { publicCourse } from '../src/features/courses/course-catalog.ts';

const COURSE_ID = '6ad790dd9fefeb3ba6d95838';
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
const lean = (value: unknown) => ({ select() { return this; }, lean: async () => value });
const response = () => ({
  statusCode: 200, body: null as any, headers: {} as Record<string, string>, sent: null as any,
  status(code: number) { this.statusCode = code; return this; },
  json(body: any) { this.body = body; return this; },
  set(name: string, value: string) { this.headers[name.toLowerCase()] = value; return this; },
  send(body: any) { this.sent = body; return this; },
  end() { return this; },
});
const adminReq = (body: any, contentType = 'image/svg+xml', idOrSlug = 'ai-edge') => ({ params: { idOrSlug }, body, headers: { 'content-type': contentType } }) as any;
const publicReq = (headers: Record<string, string> = {}) => ({ params: { slug: 'ai-edge' }, headers }) as any;

function setup(t: any, course: any = { _id: COURSE_ID, slug: 'ai-edge' }) {
  t.after(() => mock.restoreAll());
  mock.method(Course, 'findOne', () => lean(course));
  const imageWrite = mock.method(CourseImage, 'updateOne', async () => ({}));
  const imageDelete = mock.method(CourseImage, 'deleteOne', async () => ({}));
  const courseWrite = mock.method(Course, 'updateOne', async () => ({}));
  return { imageWrite, imageDelete, courseWrite };
}

test('uploading stores the image and stamps the course', async (t) => {
  const { imageWrite, courseWrite } = setup(t);
  const res = response();
  await uploadAdminCourseImage(adminReq(SVG), res as any);
  assert.equal(res.statusCode, 200);
  const [filter, update, options] = imageWrite.mock.calls[0].arguments as any[];
  assert.equal(String(filter.courseId), COURSE_ID);
  assert.equal(update.$set.contentType, 'image/svg+xml');
  assert.equal(update.$set.size, SVG.length);
  assert.deepEqual(options, { upsert: true });
  assert.ok((courseWrite.mock.calls[0].arguments[1] as any).$set.imageUpdatedAt instanceof Date);
  assert.match(res.body.imageUrl, /^\/courses\/ai-edge\/image\?v=\d+$/);
});

test('uploading to an unknown course is a 404 and stores nothing', async (t) => {
  const { imageWrite } = setup(t, null);
  const res = response();
  await uploadAdminCourseImage(adminReq(SVG), res as any);
  assert.equal(res.statusCode, 404);
  assert.equal(imageWrite.mock.callCount(), 0);
});

test('uploading an invalid image is a 400 and stores nothing', async (t) => {
  const { imageWrite } = setup(t);
  const res = response();
  await uploadAdminCourseImage(adminReq(Buffer.from('<svg><script>x()</script></svg>')), res as any);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /scripts/);
  assert.equal(imageWrite.mock.callCount(), 0);
  const notABuffer = response();
  await uploadAdminCourseImage(adminReq({}, 'application/json'), notABuffer as any);
  assert.equal(notABuffer.statusCode, 400);
});

test('deleting removes the image and clears the marker', async (t) => {
  const { imageDelete, courseWrite } = setup(t);
  const res = response();
  await deleteAdminCourseImage(adminReq(undefined), res as any);
  assert.equal(res.statusCode, 200);
  assert.equal(imageDelete.mock.callCount(), 1);
  assert.deepEqual((courseWrite.mock.calls[0].arguments[1] as any).$unset, { imageUpdatedAt: '' });
});

test('the public route serves a published course image with safe headers', async (t) => {
  t.after(() => mock.restoreAll());
  const stamp = new Date('2026-11-24T10:00:00Z');
  const find = mock.method(Course, 'findOne', () => lean({ _id: COURSE_ID, slug: 'ai-edge', imageUpdatedAt: stamp }));
  mock.method(CourseImage, 'findOne', () => lean({ contentType: 'image/svg+xml', data: SVG, size: SVG.length }));
  const res = response();
  await getPublicCourseImage(publicReq(), res as any);
  assert.deepEqual((find.mock.calls[0].arguments[0] as any), { slug: 'ai-edge', status: 'published', imageUpdatedAt: { $exists: true } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'image/svg+xml');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.match(res.headers['content-security-policy'], /sandbox/);
  assert.match(res.headers['cache-control'], /public/);
  assert.ok(res.headers.etag);
  assert.deepEqual(res.sent, SVG);
});

test('the public route answers 304 when the ETag matches', async (t) => {
  t.after(() => mock.restoreAll());
  const stamp = new Date('2026-11-24T10:00:00Z');
  mock.method(Course, 'findOne', () => lean({ _id: COURSE_ID, slug: 'ai-edge', imageUpdatedAt: stamp }));
  mock.method(CourseImage, 'findOne', () => lean({ contentType: 'image/svg+xml', data: SVG, size: SVG.length }));
  const first = response();
  await getPublicCourseImage(publicReq(), first as any);
  const second = response();
  await getPublicCourseImage(publicReq({ 'if-none-match': first.headers.etag }), second as any);
  assert.equal(second.statusCode, 304);
  assert.equal(second.sent, null);
});

test('the public route is a 404 for drafts or courses without an image', async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(Course, 'findOne', () => lean(null));
  const res = response();
  await getPublicCourseImage(publicReq(), res as any);
  assert.equal(res.statusCode, 404);
  mock.restoreAll();
  mock.method(Course, 'findOne', () => lean({ _id: COURSE_ID, slug: 'ai-edge', imageUpdatedAt: new Date() }));
  mock.method(CourseImage, 'findOne', () => lean(null));
  const missing = response();
  await getPublicCourseImage(publicReq(), missing as any);
  assert.equal(missing.statusCode, 404);
});

test('publicCourse exposes imageUrl only when an image exists and keeps other fields', () => {
  const base = { _id: COURSE_ID, slug: 'ai-edge', title: 'AI Edge', description: 'd', checkoutMethod: 'stripe', priceCents: 100, currency: 'usd', modules: [] };
  assert.equal(publicCourse(base).imageUrl, '');
  const withImage = publicCourse({ ...base, imageUpdatedAt: new Date(1000) });
  assert.equal(withImage.imageUrl, '/courses/ai-edge/image?v=1000');
  assert.equal(withImage.title, 'AI Edge');
  assert.equal(withImage.priceCents, 100);
});
