import { Router } from 'express';

import { asyncHandler } from '../../shared/http/async-handler.ts';
import { authRequired } from '../auth/auth.middleware.ts';
import { getCourse, markLessonComplete } from './course.controller.ts';

const router = Router();

router.get('/courses/:courseId', authRequired, asyncHandler(getCourse));
router.post('/courses/:courseId/progress', authRequired, asyncHandler(markLessonComplete));

export default router;
