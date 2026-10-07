import type { Request, Response } from 'express';

import Assessment from '../../models/assessment.model.ts';

export async function getAssessment(request: Request, response: Response): Promise<void> {
  try {
    const userId = request.user?.id;
    const id = String(request.params.id || '');

    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const assessment = await Assessment.findOne({ _id: id, userId }).lean();
    if (!assessment) {
      response.status(404).json({ error: 'Assessment not found.' });
      return;
    }

    response.json({ assessment });
  } catch (error) {
    console.error('getAssessment error:', error);
    response.status(500).json({ error: 'Failed to load assessment.' });
  }
}

// Milestone 3.1 Developer Plan, Module 8. Client answers 2026-10-07, #5:
// immediate self-serve start is confirmed workable — no literal
// date/time-picker scheduling step. "Start" is the dashboard's
// "Schedule Assessment" / "Continue Assessment" button calling this
// endpoint the moment the customer opens the chat, not a separate booking
// flow. Idempotent on purpose: calling it again once already in progress
// (or beyond) is a no-op, which is what lets "Continue Assessment" reuse
// the exact same call instead of needing a separate resume endpoint.
//
// Not yet handled here (per the plan's "New follow-up" open items, not
// resolved by the client as of 2026-10-07): a literal "book a meeting with
// the agent" option, and a 30-day start window after purchase. Both need a
// dev-team reply to the client before they're scoped, so this endpoint
// deliberately only implements the confirmed immediate-start mechanism.
export async function startAssessment(request: Request, response: Response): Promise<void> {
  try {
    const userId = request.user?.id;
    const id = String(request.params.id || '');

    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const assessment = await Assessment.findOne({ _id: id, userId });
    if (!assessment) {
      response.status(404).json({ error: 'Assessment not found.' });
      return;
    }

    if (assessment.status === 'purchased') {
      assessment.status = 'intake_in_progress';
      assessment.startedAt = new Date();
      await assessment.save();
    }

    response.json({ assessment });
  } catch (error) {
    console.error('startAssessment error:', error);
    response.status(500).json({ error: 'Failed to start assessment.' });
  }
}
