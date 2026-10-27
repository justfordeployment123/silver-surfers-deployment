import { Router } from 'express';

import Assessment from '../../models/assessment.model.ts';
import Course from '../../models/course.model.ts';
import { asyncHandler } from '../../shared/http/async-handler.ts';
import { authRequired } from '../auth/auth.middleware.ts';
import { QUESTIONNAIRE_VERSION } from './assessment-questions.ts';
import { canUseAssessmentPreview } from './assessment-preview.access.ts';

const router = Router();

router.use('/assessment-preview', authRequired, (request, response, next) => {
  if (!canUseAssessmentPreview(request.user)) {
    response.status(403).json({ error: 'Assessment preview is not available for this account.' });
    return;
  }
  next();
});

router.get('/assessment-preview', asyncHandler(async (request, response) => {
  const [assessment, course] = await Promise.all([
    Assessment.findOne({ userId: request.user!.id, source: 'preview' })
      .select('_id status createdAt completedAt')
      .lean(),
    Course.findOne({ slug: 'ai-edge' }).select('_id title').lean(),
  ]);

  response.json({ assessment, course });
}));

router.post('/assessment-preview', asyncHandler(async (request, response) => {
  // One preview per invited account. Repeated clicks resume the same intake
  // instead of minting unlimited AI requests or duplicate admin records.
  const assessment = await Assessment.findOneAndUpdate(
    { userId: request.user!.id, source: 'preview' },
    { $setOnInsert: { source: 'preview', questionnaireVersion: QUESTIONNAIRE_VERSION, status: 'purchased' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).select('_id status createdAt completedAt').lean();

  response.json({ assessment });
}));

export default router;
