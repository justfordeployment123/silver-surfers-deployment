import type { Request, Response } from 'express';

import Assessment from '../../models/assessment.model.ts';
import CoursePurchase from '../../models/course-purchase.model.ts';
import CourseProgress from '../../models/course-progress.model.ts';
import EbookPurchase from '../../models/ebook-purchase.model.ts';

// Dashboard aggregation endpoints (Milestone 3.1 Developer Plan, Module 3).
// Deliberately a separate feature folder, not placed inside
// features/courses, features/assessments, or features/ebooks — those will
// later house the purchase-flow endpoints for Modules 5/8/16, and keeping
// this read-only dashboard concern separate avoids route-file collisions
// once that work starts.
//
// Three endpoints, not one combined call, matching the existing
// app/(site)/account/page.js precedent of Promise.all-ing several small
// list calls rather than one aggregate payload.

function courseStatus(totalLessons: number, completedLessons: number): 'not_started' | 'in_progress' | 'complete' {
  if (completedLessons <= 0) {
    return 'not_started';
  }
  if (completedLessons >= totalLessons && totalLessons > 0) {
    return 'complete';
  }
  return 'in_progress';
}

export async function getMyCourses(request: Request, response: Response): Promise<void> {
  try {
    const userId = request.user?.id;
    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const purchases = await CoursePurchase.find({ userId })
      .populate('courseId', 'title slug modules')
      .sort({ purchasedAt: -1 })
      .lean();

    const progressDocs = await CourseProgress.find({ userId }).lean();
    const progressByCourseId = new Map(progressDocs.map((progress: any) => [String(progress.courseId), progress]));

    const courses = purchases
      .filter((purchase: any) => purchase.courseId)
      .map((purchase: any) => {
        const course = purchase.courseId;
        const progress = progressByCourseId.get(String(course._id));
        const totalLessons = (course.modules || []).reduce(
          (sum: number, courseModule: any) => sum + (courseModule.lessons || []).length,
          0,
        );
        const completedLessons = (progress?.moduleProgress || []).reduce(
          (sum: number, moduleProgress: any) => sum + (moduleProgress.completedLessonIds || []).length,
          0,
        );
        const completedModules = (progress?.moduleProgress || []).filter(
          (moduleProgress: any) => moduleProgress.completedAt,
        ).length;

        return {
          courseId: String(course._id),
          title: course.title,
          slug: course.slug,
          totalModules: (course.modules || []).length,
          completedModules,
          status: courseStatus(totalLessons, completedLessons),
          lastLessonId: progress?.moduleProgress?.at(-1)?.lastLessonId || null,
        };
      });

    response.json({ courses });
  } catch (error) {
    console.error('getMyCourses error:', error);
    response.status(500).json({ error: 'Failed to load courses.' });
  }
}

export async function getMyAssessments(request: Request, response: Response): Promise<void> {
  try {
    const userId = request.user?.id;
    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const assessments = await Assessment.find({ userId })
      .select('status createdAt completedAt')
      .sort({ createdAt: -1 })
      .lean();

    response.json({
      assessments: assessments.map((assessment: any) => ({
        assessmentId: String(assessment._id),
        status: assessment.status,
        createdAt: assessment.createdAt,
        completedAt: assessment.completedAt,
      })),
    });
  } catch (error) {
    console.error('getMyAssessments error:', error);
    response.status(500).json({ error: 'Failed to load assessments.' });
  }
}

export async function getMyEbooks(request: Request, response: Response): Promise<void> {
  try {
    const userId = request.user?.id;
    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const purchases = await EbookPurchase.find({ userId })
      .populate('ebookId', 'title slug coverImage')
      .sort({ purchasedAt: -1 })
      .lean();

    response.json({
      ebooks: purchases
        .filter((purchase: any) => purchase.ebookId)
        .map((purchase: any) => ({
          ebookId: String(purchase.ebookId._id),
          title: purchase.ebookId.title,
          slug: purchase.ebookId.slug,
          coverImage: purchase.ebookId.coverImage || null,
        })),
    });
  } catch (error) {
    console.error('getMyEbooks error:', error);
    response.status(500).json({ error: 'Failed to load ebooks.' });
  }
}
