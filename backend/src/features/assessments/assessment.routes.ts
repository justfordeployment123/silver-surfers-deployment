import { Router } from 'express';

import { asyncHandler } from '../../shared/http/async-handler.ts';
import { authRequired } from '../auth/auth.middleware.ts';
import { getAssessment, startAssessment } from './assessment.controller.ts';

const router = Router();

router.get('/assessments/:id', authRequired, asyncHandler(getAssessment));
router.post('/assessments/:id/start', authRequired, asyncHandler(startAssessment));

export default router;
