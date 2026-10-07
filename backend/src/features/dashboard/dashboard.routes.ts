import { Router } from 'express';

import { asyncHandler } from '../../shared/http/async-handler.ts';
import { authRequired } from '../auth/auth.middleware.ts';
import { getMyAssessments, getMyCourses, getMyEbooks } from './dashboard.controller.ts';

const router = Router();

router.get('/dashboard/courses', authRequired, asyncHandler(getMyCourses));
router.get('/dashboard/assessments', authRequired, asyncHandler(getMyAssessments));
router.get('/dashboard/ebooks', authRequired, asyncHandler(getMyEbooks));

export default router;
