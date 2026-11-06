import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeCourseUpdate, normalizeYouTubeId } from '../src/features/admin/admin-courses.validation.ts';

test('normalizes a complete course update and preserves stable content IDs', () => {
  const result = normalizeCourseUpdate({
    title: '  AI Edge  ',
    modules: [{
      moduleId: 'module-1',
      title: '  AI Foundations ',
      order: 99,
      lessons: [{
        lessonId: 'lesson-1',
        title: ' Introduction ',
        youtubeId: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        description: '  Welcome to the course. ',
        order: 7,
        downloads: [{ label: ' Workbook ', s3Key: ' courses/workbook.pdf ' }],
      }],
    }],
  });

  assert.deepEqual(result, {
    title: 'AI Edge',
    modules: [{
      moduleId: 'module-1',
      title: 'AI Foundations',
      order: 1,
      lessons: [{
        lessonId: 'lesson-1',
        title: 'Introduction',
        youtubeId: 'dQw4w9WgXcQ',
        description: 'Welcome to the course.',
        order: 1,
        downloads: [{ label: 'Workbook', s3Key: 'courses/workbook.pdf' }],
      }],
    }],
  });
});

test('accepts common YouTube URL formats and raw video IDs', () => {
  assert.equal(normalizeYouTubeId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(normalizeYouTubeId('https://youtu.be/dQw4w9WgXcQ?t=12'), 'dQw4w9WgXcQ');
  assert.equal(normalizeYouTubeId('https://youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(normalizeYouTubeId('https://youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(normalizeYouTubeId(''), '');
});

test('rejects an invalid YouTube link', () => {
  assert.throws(
    () => normalizeYouTubeId('https://example.com/not-a-video'),
    /valid YouTube video ID or link/i,
  );
});

test('requires a course title and module titles', () => {
  assert.throws(() => normalizeCourseUpdate({ title: '', modules: [] }), /course title is required/i);
  assert.throws(
    () => normalizeCourseUpdate({ title: 'AI Edge', modules: [{ moduleId: 'one', title: '', lessons: [] }] }),
    /module 1 title is required/i,
  );
});

test('rejects duplicate module and lesson IDs because progress depends on them', () => {
  assert.throws(() => normalizeCourseUpdate({
    title: 'AI Edge',
    modules: [
      { moduleId: 'same', title: 'One', lessons: [] },
      { moduleId: 'same', title: 'Two', lessons: [] },
    ],
  }), /module ID "same" is used more than once/i);

  assert.throws(() => normalizeCourseUpdate({
    title: 'AI Edge',
    modules: [
      { moduleId: 'one', title: 'One', lessons: [{ lessonId: 'same', title: 'A' }] },
      { moduleId: 'two', title: 'Two', lessons: [{ lessonId: 'same', title: 'B' }] },
    ],
  }), /lesson ID "same" is used more than once/i);
});

test('allows a text or resource lesson without a video', () => {
  const result = normalizeCourseUpdate({
    title: 'AI Edge',
    modules: [{
      moduleId: 'resources',
      title: 'Resources',
      lessons: [{ lessonId: 'worksheet', title: 'Worksheet', description: 'Download and complete this.', downloads: [] }],
    }],
  });

  assert.equal(result.modules[0].lessons[0].youtubeId, '');
});
