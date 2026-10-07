import type { Request, Response } from 'express';

import Course from '../../models/course.model.ts';
import CoursePurchase from '../../models/course-purchase.model.ts';
import CourseProgress from '../../models/course-progress.model.ts';

async function ownsCourse(userId: string, courseId: string): Promise<boolean> {
  const purchase = await CoursePurchase.findOne({ userId, courseId }).lean();
  return Boolean(purchase);
}

export async function getCourse(request: Request, response: Response): Promise<void> {
  try {
    const userId = request.user?.id;
    const { courseId } = request.params;

    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!(await ownsCourse(userId, courseId))) {
      response.status(403).json({ error: 'You do not own this course.' });
      return;
    }

    const course = await Course.findById(courseId).lean();
    if (!course) {
      response.status(404).json({ error: 'Course not found.' });
      return;
    }

    const progress = await CourseProgress.findOne({ userId, courseId }).lean();

    response.json({ course, progress: progress || { moduleProgress: [] } });
  } catch (error) {
    console.error('getCourse error:', error);
    response.status(500).json({ error: 'Failed to load course.' });
  }
}

// Milestone 3.1 Developer Plan, Module 6. Body is just { lessonId } — the
// module it belongs to is derived server-side by scanning the course
// structure, matching the plan's own described interface rather than
// requiring the frontend to also know/send moduleId.
export async function markLessonComplete(request: Request, response: Response): Promise<void> {
  try {
    const userId = request.user?.id;
    const { courseId } = request.params;
    const { lessonId } = request.body ?? {};

    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!lessonId || typeof lessonId !== 'string') {
      response.status(400).json({ error: 'lessonId is required.' });
      return;
    }

    if (!(await ownsCourse(userId, courseId))) {
      response.status(403).json({ error: 'You do not own this course.' });
      return;
    }

    const course = await Course.findById(courseId).lean();
    if (!course) {
      response.status(404).json({ error: 'Course not found.' });
      return;
    }

    const courseModule = (course.modules || []).find(
      (candidate: any) => (candidate.lessons || []).some((lesson: any) => lesson.lessonId === lessonId),
    );

    if (!courseModule) {
      response.status(400).json({ error: 'Unknown lessonId for this course.' });
      return;
    }

    let progress = await CourseProgress.findOne({ userId, courseId });
    if (!progress) {
      progress = await CourseProgress.create({ userId, courseId, moduleProgress: [] });
    }

    let moduleProgress = progress.moduleProgress.find(
      (candidate: any) => candidate.moduleId === courseModule.moduleId,
    );
    if (!moduleProgress) {
      progress.moduleProgress.push({
        moduleId: courseModule.moduleId,
        completedLessonIds: [],
        lastLessonId: null,
        completedAt: null,
      });
      moduleProgress = progress.moduleProgress[progress.moduleProgress.length - 1];
    }

    if (!moduleProgress.completedLessonIds.includes(lessonId)) {
      moduleProgress.completedLessonIds.push(lessonId);
    }
    moduleProgress.lastLessonId = lessonId;

    const allLessonIds = (courseModule.lessons || []).map((lesson: any) => lesson.lessonId);
    const allComplete = allLessonIds.length > 0
      && allLessonIds.every((id: string) => moduleProgress.completedLessonIds.includes(id));
    moduleProgress.completedAt = allComplete ? new Date() : null;

    await progress.save();

    response.json({ progress });
  } catch (error) {
    console.error('markLessonComplete error:', error);
    response.status(500).json({ error: 'Failed to update progress.' });
  }
}
