type DownloadInput = { label?: unknown; s3Key?: unknown };
type LessonInput = {
  lessonId?: unknown; title?: unknown; youtubeId?: unknown; description?: unknown;
  downloads?: unknown; order?: unknown;
};
type ModuleInput = { moduleId?: unknown; title?: unknown; lessons?: unknown; order?: unknown };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const CONTENT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeYouTubeId(value: unknown): string {
  const input = text(value);
  if (!input) return '';
  if (YOUTUBE_ID.test(input)) return input;

  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let candidate = '';
    if (host === 'youtu.be') candidate = url.pathname.split('/').filter(Boolean)[0] || '';
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      candidate = url.searchParams.get('v') || '';
      if (!candidate) {
        const parts = url.pathname.split('/').filter(Boolean);
        if (['embed', 'shorts', 'live'].includes(parts[0])) candidate = parts[1] || '';
      }
    }
    if (YOUTUBE_ID.test(candidate)) return candidate;
  } catch {
    // The human-friendly error below covers malformed URLs and IDs.
  }

  throw new Error('Enter a valid YouTube video ID or link.');
}

function requiredContentId(value: unknown, label: string): string {
  const result = text(value);
  if (!CONTENT_ID.test(result)) {
    throw new Error(`${label} must use letters, numbers, dashes, or underscores.`);
  }
  return result;
}

function normalizeDownloads(value: unknown, lessonNumber: number): Array<{ label: string; s3Key: string }> {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`Lesson ${lessonNumber} resources must be a list.`);
  if (value.length > 25) throw new Error(`Lesson ${lessonNumber} cannot have more than 25 resources.`);
  return value.map((raw, index) => {
    const download = (raw || {}) as DownloadInput;
    const label = text(download.label);
    const s3Key = text(download.s3Key);
    if (!label || !s3Key) throw new Error(`Resource ${index + 1} in lesson ${lessonNumber} needs a label and storage key.`);
    return { label, s3Key };
  });
}

export function normalizeCourseUpdate(value: unknown): {
  title: string;
  modules: Array<{
    moduleId: string; title: string; order: number;
    lessons: Array<{
      lessonId: string; title: string; youtubeId: string; description: string;
      downloads: Array<{ label: string; s3Key: string }>; order: number;
    }>;
  }>;
} {
  const body = (value || {}) as { title?: unknown; modules?: unknown };
  const title = text(body.title);
  if (!title) throw new Error('Course title is required.');
  if (!Array.isArray(body.modules)) throw new Error('Course modules must be a list.');
  if (body.modules.length > 100) throw new Error('A course cannot have more than 100 modules.');

  const moduleIds = new Set<string>();
  const lessonIds = new Set<string>();
  let lessonNumber = 0;
  const modules = body.modules.map((rawModule, moduleIndex) => {
    const item = (rawModule || {}) as ModuleInput;
    const moduleId = requiredContentId(item.moduleId, `Module ${moduleIndex + 1} ID`);
    if (moduleIds.has(moduleId)) throw new Error(`Module ID "${moduleId}" is used more than once.`);
    moduleIds.add(moduleId);
    const moduleTitle = text(item.title);
    if (!moduleTitle) throw new Error(`Module ${moduleIndex + 1} title is required.`);
    if (!Array.isArray(item.lessons)) throw new Error(`Module ${moduleIndex + 1} lessons must be a list.`);
    if (item.lessons.length > 100) throw new Error(`Module ${moduleIndex + 1} cannot have more than 100 lessons.`);

    const lessons = item.lessons.map((rawLesson, lessonIndex) => {
      lessonNumber += 1;
      const lesson = (rawLesson || {}) as LessonInput;
      const lessonId = requiredContentId(lesson.lessonId, `Lesson ${lessonNumber} ID`);
      if (lessonIds.has(lessonId)) throw new Error(`Lesson ID "${lessonId}" is used more than once.`);
      lessonIds.add(lessonId);
      const lessonTitle = text(lesson.title);
      if (!lessonTitle) throw new Error(`Lesson ${lessonIndex + 1} in module ${moduleIndex + 1} needs a title.`);
      return {
        lessonId,
        title: lessonTitle,
        youtubeId: normalizeYouTubeId(lesson.youtubeId),
        description: text(lesson.description),
        downloads: normalizeDownloads(lesson.downloads, lessonNumber),
        order: lessonIndex + 1,
      };
    });
    return { moduleId, title: moduleTitle, order: moduleIndex + 1, lessons };
  });

  return { title, modules };
}
