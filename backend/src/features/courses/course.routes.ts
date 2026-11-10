import { Router } from 'express';

import { asyncHandler } from '../../shared/http/async-handler.ts';
import { authRequired } from '../auth/auth.middleware.ts';
import { getCourse, markLessonComplete } from './course.controller.ts';
import Course from '../../models/course.model.ts';
import { publicCourse } from './course-catalog.ts';

const router = Router();
router.get('/courses', asyncHandler(async (_request, response) => {
  const courses = await Course.find({status:'published'}).sort({createdAt:-1}).lean();
  response.json({items:courses.map(publicCourse)});
}));

router.get('/courses/:courseId', authRequired, asyncHandler(getCourse));
router.post('/courses/:courseId/progress', authRequired, asyncHandler(markLessonComplete));

export default router;
