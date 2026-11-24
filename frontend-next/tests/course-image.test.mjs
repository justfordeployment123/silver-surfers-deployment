import assert from 'node:assert/strict';
import test from 'node:test';

import { courseImageSrc, validateImageFile, MAX_IMAGE_BYTES } from '../lib/courseImage.js';

const BUNDLED = { 'everyday-ai-for-business': '/explore/everyday-ai-for-business.svg' };
const FALLBACK = '/explore/ai-edge.svg';
const API = 'https://api.example.com';

test('an uploaded image wins and is loaded from the API host', () => {
  const course = { slug: 'everyday-ai-for-business', imageUrl: '/courses/everyday-ai-for-business/image?v=5' };
  assert.equal(courseImageSrc(course, BUNDLED, FALLBACK, API), 'https://api.example.com/courses/everyday-ai-for-business/image?v=5');
});

test('without an upload the bundled image for the slug is used', () => {
  assert.equal(courseImageSrc({ slug: 'everyday-ai-for-business', imageUrl: '' }, BUNDLED, FALLBACK, API), '/explore/everyday-ai-for-business.svg');
  assert.equal(courseImageSrc({ slug: 'everyday-ai-for-business' }, BUNDLED, FALLBACK, API), '/explore/everyday-ai-for-business.svg');
});

test('with neither, the fallback image is used', () => {
  assert.equal(courseImageSrc({ slug: 'new-course' }, BUNDLED, FALLBACK, API), FALLBACK);
  assert.equal(courseImageSrc(null, BUNDLED, FALLBACK, API), FALLBACK);
});

test('an absolute image URL is left alone', () => {
  assert.equal(courseImageSrc({ slug: 'x', imageUrl: 'https://cdn.example.com/a.png' }, BUNDLED, FALLBACK, API), 'https://cdn.example.com/a.png');
});

test('the picker accepts supported images and explains why it rejects others', () => {
  assert.equal(validateImageFile({ type: 'image/svg+xml', size: 1000 }), '');
  assert.equal(validateImageFile({ type: 'image/png', size: 1000 }), '');
  assert.match(validateImageFile({ type: 'application/pdf', size: 1000 }), /PNG, JPEG, WebP or SVG/);
  assert.match(validateImageFile({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 }), /5 MB/);
  assert.match(validateImageFile(null), /Choose an image/);
});
