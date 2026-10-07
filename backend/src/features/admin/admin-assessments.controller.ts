import type { Request, Response } from 'express';

import Assessment from '../../models/assessment.model.ts';
import User from '../../models/user.model.ts';
import { sendAssessmentReportReadyEmail } from '../assessments/assessment-email.service.ts';
import { getQuestionById } from '../assessments/assessment-questions.ts';
import { generateAssessmentReport } from '../assessments/assessment-report.ts';

// Milestone 3.1 Developer Plan, Module 13. Kept as its own file rather than
// appended into admin.controller.ts (already ~2000 lines handling
// users/scans/blog/services/faqs/contact) — routed through the same
// admin.routes.ts router.use(authRequired, adminRequired) guard either
// way, so splitting the file changes nothing about auth.

export async function getAssessments(request: Request, response: Response): Promise<void> {
  try {
    const status = String(request.query.status || '').trim();
    const page = Math.max(1, Number(request.query.page) || 1);
    const limit = Math.min(Math.max(1, Number(request.query.limit) || 50), 200);
    const skip = (page - 1) * limit;

    const match: Record<string, unknown> = {};
    if (status) {
      match.status = status;
    }

    // Lists Assessments with status: 'pending_review' first (Module 13) —
    // a computed sort key rather than a real indexable field, same
    // aggregation-pipeline approach admin.controller.ts's getUsers already
    // uses for its own computed subscriptionStatus sort/filter.
    const pipeline: Record<string, unknown>[] = [
      { $match: match },
      { $addFields: { reviewPriority: { $cond: [{ $eq: ['$status', 'pending_review'] }, 0, 1] } } },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $addFields: { user: { $arrayElemAt: ['$user', 0] } } },
      {
        $facet: {
          data: [
            { $sort: { reviewPriority: 1, createdAt: -1 } },
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                status: 1,
                createdAt: 1,
                completedAt: 1,
                needsAdminAttention: 1,
                'aiReport.status': 1,
                'aiReport.provider': 1,
                'aiReport.generatedAt': 1,
                'adminReview.decision': 1,
                'adminReview.reviewedAt': 1,
                'user.email': 1,
                'user.firstName': 1,
                'user.lastName': 1,
              },
            },
          ],
          totalCount: [{ $count: 'count' }],
        },
      },
    ];

    const [result] = await Assessment.aggregate(pipeline);
    const items = result?.data || [];
    const total = result?.totalCount?.[0]?.count || 0;

    response.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
  } catch (error) {
    console.error('getAssessments error:', error);
    response.status(500).json({ error: 'Failed to fetch assessments.' });
  }
}

export async function getAssessmentForAdmin(request: Request, response: Response): Promise<void> {
  try {
    const id = String(request.params.id || '');
    const assessment = await Assessment.findById(id).populate('userId', 'email firstName lastName').lean();
    if (!assessment) {
      response.status(404).json({ error: 'Assessment not found.' });
      return;
    }

    // The stored answer only has {questionId, text} — the reviewer needs
    // the actual question wording to make sense of it, so attach it here
    // rather than making the admin UI hardcode a copy of the question set.
    const answers = ((assessment as unknown as { answers: Array<{ questionId: number; text: string; clarified: boolean }> }).answers || [])
      .map((answer) => ({
        ...answer,
        question: getQuestionById(answer.questionId)?.prompt || `Question ${answer.questionId}`,
        section: getQuestionById(answer.questionId)?.section || '',
      }));

    response.json({ assessment: { ...assessment, answers } });
  } catch (error) {
    console.error('getAssessmentForAdmin error:', error);
    response.status(500).json({ error: 'Failed to fetch assessment.' });
  }
}

// Client answers 2026-10-07, #7: staff can hand-edit the AI draft directly
// before approving — the simplest viable option (no separate
// edit-then-regenerate workflow state machine).
export async function updateAssessmentReport(request: Request, response: Response): Promise<void> {
  try {
    const id = String(request.params.id || '');
    const { sections } = request.body ?? {};

    if (!sections || typeof sections !== 'object') {
      response.status(400).json({ error: 'sections is required.' });
      return;
    }

    const assessment = await Assessment.findById(id);
    if (!assessment) {
      response.status(404).json({ error: 'Assessment not found.' });
      return;
    }

    assessment.aiReport.sections = sections;
    await assessment.save();

    response.json({ assessment });
  } catch (error) {
    console.error('updateAssessmentReport error:', error);
    response.status(500).json({ error: 'Failed to update the report.' });
  }
}

// Client answers 2026-10-07, #7: "or having AI re-write the report" — reuses
// Module 12's generateAssessmentReport exactly, it was built callable on
// demand for precisely this.
export async function regenerateAssessmentReport(request: Request, response: Response): Promise<void> {
  try {
    const id = String(request.params.id || '');
    const existing = await Assessment.findById(id).lean();
    if (!existing) {
      response.status(404).json({ error: 'Assessment not found.' });
      return;
    }

    await generateAssessmentReport(id);
    const refreshed = await Assessment.findById(id).lean();

    response.json({ assessment: refreshed });
  } catch (error) {
    console.error('regenerateAssessmentReport error:', error);
    response.status(500).json({ error: 'Failed to regenerate the report.' });
  }
}

// Client answers 2026-10-07, #7: "we need to have an approve button for
// sure and capture which staff member approved it and when." reviewedBy/
// reviewedAt/decision already exist on the schema (Module 1) — this is the
// only place that ever sets status: 'report_ready' (answers doc #6: no
// customer sees a report without a human approval step).
export async function approveAssessmentReport(request: Request, response: Response): Promise<void> {
  try {
    const id = String(request.params.id || '');
    const notes = String(request.body?.notes || '').trim();
    const reviewerId = request.user?.id;

    const assessment = await Assessment.findById(id);
    if (!assessment) {
      response.status(404).json({ error: 'Assessment not found.' });
      return;
    }

    assessment.status = 'report_ready';
    assessment.adminReview = {
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      decision: 'approved',
      notes,
    };
    await assessment.save();

    const user = await User.findById(assessment.userId).lean();
    if (user?.email) {
      try {
        await sendAssessmentReportReadyEmail(user.email);
      } catch (error) {
        console.error('Failed to send assessment report-ready email:', error);
      }
    }

    response.json({ assessment });
  } catch (error) {
    console.error('approveAssessmentReport error:', error);
    response.status(500).json({ error: 'Failed to approve the report.' });
  }
}
