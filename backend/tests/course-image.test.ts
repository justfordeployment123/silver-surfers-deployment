import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_COURSE_IMAGE_BYTES, validateCourseImage } from '../src/features/courses/course-image.ts';

const svg = (body = '<rect width="1" height="1"/>') => Buffer.from(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">${body}</svg>`);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);

test('accepts SVG, PNG, JPEG and WebP images', () => {
  assert.equal(validateCourseImage('image/svg+xml', svg()), 'image/svg+xml');
  assert.equal(validateCourseImage('image/png', png), 'image/png');
  assert.equal(validateCourseImage('image/jpeg', jpeg), 'image/jpeg');
  assert.equal(validateCourseImage('image/webp', webp), 'image/webp');
});

test('ignores a charset suffix on the content type', () => {
  assert.equal(validateCourseImage('image/svg+xml; charset=utf-8', svg()), 'image/svg+xml');
});

test('rejects unsupported types and empty or missing bodies', () => {
  assert.throws(() => validateCourseImage('application/pdf', png), /PNG, JPEG, WebP or SVG/);
  assert.throws(() => validateCourseImage('image/png', Buffer.alloc(0)), /Choose an image/);
  assert.throws(() => validateCourseImage('image/png', undefined), /Choose an image/);
});

test('rejects files larger than the limit', () => {
  const big = Buffer.concat([png, Buffer.alloc(MAX_COURSE_IMAGE_BYTES)]);
  assert.throws(() => validateCourseImage('image/png', big), /5 MB/);
});

test('rejects a file whose contents do not match its declared type', () => {
  assert.throws(() => validateCourseImage('image/png', jpeg), /does not match/);
  assert.throws(() => validateCourseImage('image/svg+xml', png), /does not match/);
  assert.throws(() => validateCourseImage('image/png', Buffer.from('MZ not an image')), /does not match/);
});

test('rejects SVGs that contain script, event handlers or javascript links', () => {
  assert.throws(() => validateCourseImage('image/svg+xml', svg('<script>alert(1)</script>')), /scripts/);
  assert.throws(() => validateCourseImage('image/svg+xml', svg('<rect onload="x()"/>')), /scripts/);
  assert.throws(() => validateCourseImage('image/svg+xml', svg('<a href="javascript:alert(1)"><rect/></a>')), /scripts/);
  assert.throws(() => validateCourseImage('image/svg+xml', svg('<foreignObject><div/></foreignObject>')), /scripts/);
});
